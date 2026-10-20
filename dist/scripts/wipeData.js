import mongoose from 'mongoose';
import dns from 'dns';
import dotenv from 'dotenv';
dotenv.config();
try {
    dns.setDefaultResultOrder?.('ipv4first');
    dns.setServers(['8.8.8.8', '1.1.1.1']);
}
catch (e) { }
const wipeDatabase = async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('No MONGODB_URI found in .env');
        process.exit(1);
    }
    console.log('[Wipe] Connecting to MongoDB Atlas...');
    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    if (!db) {
        console.error('No database connection object found.');
        process.exit(1);
    }
    const collections = await db.listCollections().toArray();
    console.log(`[Wipe] Found ${collections.length} collections:`, collections.map(c => c.name));
    for (const coll of collections) {
        await db.collection(coll.name).deleteMany({});
        console.log(`[Wipe] Cleared all documents from: ${coll.name}`);
    }
    console.log('[Wipe] Successfully cleared all accounts, spaces, scratchbooks, gallery items, chat messages, and dates!');
    await mongoose.disconnect();
    process.exit(0);
};
wipeDatabase().catch((err) => {
    console.error('[Wipe] Error during wipe:', err);
    process.exit(1);
});
