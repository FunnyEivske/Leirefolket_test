const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

/**
 * Scheduled function that runs every 24 hours to clean up accounts 
 * marked for deletion more than 30 days ago.
 */
exports.cleanupPendingDeletions = functions.pubsub
    .schedule('every 24 hours')
    .onRun(async (context) => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const thirtyDaysAgoTimestamp = admin.firestore.Timestamp.fromDate(thirtyDaysAgo);

        // 1. Find users pending deletion (> 30 days)
        const pendingSnapshot = await db.collection('users')
            .where('status', '==', 'pending_deletion')
            .where('deletionRequestedAt', '<=', thirtyDaysAgoTimestamp)
            .get();

        if (pendingSnapshot.empty) {
            console.log('No users pending deletion for cleanup.');
            return null;
        }

        const cleanupPromises = pendingSnapshot.docs.map(async (doc) => {
            const userData = doc.data();
            const userId = doc.id;

            try {
                // 2. Archive core information
                await db.collection('archive').doc(userId).set({
                    uid: userId,
                    fullName: userData.displayName || 'Ukjent',
                    email: userData.email || 'Ingen e-post',
                    role: userData.role || 'member',
                    startDate: userData.startDate || userData.memberSince || null,
                    archivedAt: admin.firestore.FieldValue.serverTimestamp(),
                    reason: 'voluntary' // Default for requested deletion
                });

                // 3. Delete from users collection
                await db.collection('users').doc(userId).delete();

                // 4. Delete from Firebase Auth
                await admin.auth().deleteUser(userId);

                console.log(`Successfully archived and deleted user: ${userId}`);
            } catch (error) {
                console.error(`Error cleaning up user ${userId}:`, error);
            }
        });

        await Promise.all(cleanupPromises);
        return null;
    });

/**
 * Callable function for Admin to trigger permanent deletion immediately.
 * (Used by the "Permanent slett nå" button in UI)
 */
exports.permanentDeleteNow = functions.https.onCall(async (data, context) => {
    // 1. Check if authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Du må være logget inn.');
    }

    // 2. Check if requester is Admin in Firestore
    const requesterDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!requesterDoc.exists || requesterDoc.data().role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Kun administratorer kan slette brukere permanent.');
    }

    const { userId } = data;
    if (!userId) {
        throw new functions.https.HttpsError('invalid-argument', 'Mangler bruker-ID.');
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Bruker ikke funnet.');
    }

    const userData = userDoc.data();

    try {
        // Step 1: Archive (using userId as document ID for easier restoration/uniqueness check)
        await db.collection('archive').doc(userId).set({
            uid: userId,
            fullName: userData.displayName || 'Ukjent',
            email: userData.email || 'Ingen e-post',
            role: userData.role || 'member',
            startDate: userData.startDate || userData.memberSince || null,
            archivedAt: admin.firestore.FieldValue.serverTimestamp(),
            reason: 'banned/immediate'
        });

        // Step 2: Delete Firestore
        await userRef.delete();

        // Step 3: Delete Auth
        await admin.auth().deleteUser(userId);

        return { success: true, message: `Bruker ${userId} er slettet permanent og arkivert.` };
    } catch (error) {
        console.error(`Error during immediate deletion for ${userId}:`, error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Callable function to restore a user's account from pending deletion status.
 * (Used by the "Gjenopprett" button in UI for pending_deletion status)
 */
exports.restoreUserAccount = functions.https.onCall(async (data, context) => {
    // 1. Check if authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Du må være logget inn.');
    }

    // 2. Check if requester is Admin in Firestore
    const requesterDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!requesterDoc.exists || requesterDoc.data().role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Kun administratorer kan gjenopprette brukere.');
    }

    const { userId } = data;
    if (!userId) {
        throw new functions.https.HttpsError('invalid-argument', 'Mangler bruker-ID.');
    }

    try {
        // 1. Update Firestore status
        await db.collection('users').doc(userId).update({
            status: 'active',
            deletionRequestedAt: null
        });

        // 2. Re-enable in Firebase Auth
        await admin.auth().updateUser(userId, {
            disabled: false
        });

        return { success: true, message: `Bruker ${userId} er gjenopprettet.` };
    } catch (error) {
        console.error(`Error restoring user ${userId}:`, error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Restores a user from the archive.
 * Creates a new Auth user and moves archived data back to 'users' collection.
 */
exports.restoreFromArchive = functions.https.onCall(async (data, context) => {
    // 1. Check if authenticated and Admin
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Du må være logget inn.');
    const requesterDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!requesterDoc.exists || requesterDoc.data().role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Kun administratorer kan gjenopprette fra arkiv.');
    }

    const { userId } = data;
    if (!userId) throw new functions.https.HttpsError('invalid-argument', 'Mangler bruker-ID.');

    const archiveRef = db.collection('archive').doc(userId);
    const archiveDoc = await archiveRef.get();

    if (!archiveDoc.exists) throw new functions.https.HttpsError('not-found', 'Profil ikke funnet i arkiv.');

    const archiveData = archiveDoc.data();
    if (!archiveData.email || archiveData.email === 'Ingen e-post') {
        throw new functions.https.HttpsError('failed-precondition', 'Brukeren har ingen e-post i arkiv og kan ikke gjenopprettes automatisk.');
    }

    try {
        // 1. Create a new Auth user with a random password
        // They will need to reset this to log in
        const tempPassword = Math.random().toString(36).slice(-10) + "A1!";
        const newAuthUser = await admin.auth().createUser({
            uid: userId, // Try to keep original UID if possible (it will be available if Auth was deleted)
            email: archiveData.email,
            password: tempPassword,
            displayName: archiveData.fullName
        });

        // 2. Move data back to users collection, but RESET TOS acceptance
        await db.collection('users').doc(userId).set({
            displayName: archiveData.fullName,
            email: archiveData.email,
            role: archiveData.role || 'member',
            memberSince: archiveData.startDate || null,
            status: 'active',
            termsAccepted: false, // RESET TOS
            restoredFromArchiveAt: admin.firestore.FieldValue.serverTimestamp(),
            restoredBy: context.auth.uid
        });

        // 3. Remove from archive
        await archiveRef.delete();

        return {
            success: true,
            message: `Bruker ${archiveData.fullName} er gjenopprettet. De må bruke 'Glemt passord' for å logge inn.`
        };
    } catch (error) {
        console.error(`Error restoring from archive ${userId}:`, error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Wipes a user permanently from the archive.
 */
exports.wipeFromArchive = functions.https.onCall(async (data, context) => {
    // 1. Check if authenticated and Admin
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Du må være logget inn.');
    const requesterDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!requesterDoc.exists || requesterDoc.data().role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Kun administratorer kan slette fra arkiv.');
    }

    const { userId } = data;
    if (!userId) throw new functions.https.HttpsError('invalid-argument', 'Mangler bruker-ID.');

    try {
        await db.collection('archive').doc(userId).delete();
        return { success: true, message: "Bruker er slettet permanent fra arkivet." };
    } catch (error) {
        console.error(`Error wiping from archive ${userId}:`, error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
