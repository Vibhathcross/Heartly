import mongoose from 'mongoose';
import dns from 'dns';
// Configure DNS fallback for MongoDB Atlas SRV records on Windows
try {
    dns.setDefaultResultOrder?.('ipv4first');
    dns.setServers(['8.8.8.8', '1.1.1.1']);
}
catch (e) {
    // Safe fallback
}
let gfsBucket = null;
const DIRECT_REPLICA_URI = 'mongodb://vibhathcross_db_user:kJvLiaaQVufRIDkX@ac-4ngm1dq-shard-00-00.ezjcbqg.mongodb.net:27017,ac-4ngm1dq-shard-00-01.ezjcbqg.mongodb.net:27017,ac-4ngm1dq-shard-00-02.ezjcbqg.mongodb.net:27017/heartly?ssl=true&replicaSet=atlas-17n55l-shard-0&authSource=admin&retryWrites=true&w=majority';
export const connectDB = async () => {
    const uri = process.env.MONGODB_URI || DIRECT_REPLICA_URI;
    try {
        const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
        console.log(`[MongoDB] Connected successfully to: ${conn.connection.host}/${conn.connection.name}`);
        // Initialize MongoDB GridFS for storing photos/media directly in MongoDB
        if (conn.connection.db) {
            gfsBucket = new mongoose.mongo.GridFSBucket(conn.connection.db, {
                bucketName: 'heartly_gallery'
            });
            console.log('[GridFS] Initialized "heartly_gallery" GridFS bucket in MongoDB');
        }
    }
    catch (error) {
        console.warn('[MongoDB] Initial connection error, trying direct replica set fallback...');
        try {
            const conn = await mongoose.connect(DIRECT_REPLICA_URI, { serverSelectionTimeoutMS: 20000 });
            console.log(`[MongoDB] Connected successfully via fallback to: ${conn.connection.host}/${conn.connection.name}`);
            if (conn.connection.db) {
                gfsBucket = new mongoose.mongo.GridFSBucket(conn.connection.db, {
                    bucketName: 'heartly_gallery'
                });
                console.log('[GridFS] Initialized "heartly_gallery" GridFS bucket in MongoDB');
            }
        }
        catch (fallbackError) {
            console.error('[MongoDB] Connection error:', fallbackError);
            throw fallbackError;
        }
    }
};
export const getGridFSBucket = () => {
    if (!gfsBucket) {
        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('MongoDB database not connected');
        }
        gfsBucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'heartly_gallery' });
    }
    return gfsBucket;
};
