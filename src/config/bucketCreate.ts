import { Storage } from '@google-cloud/storage'

interface BucketCreate {
    bucketName: string
    projectID: string
}

async function createBucket({ bucketName, projectID }: BucketCreate) {
    // Creating a client
    const storage = new Storage({ projectId: projectID });

    try {
        await storage.createBucket(bucketName)
        console.log(`Bucket ${bucketName} created successfully.`);
    } catch (error) {
        console.error(`Error creating bucket: ${error.message}`);
        throw error;

    }
}


createBucket({ bucketName: 'bucketbysdk1', projectID: 'gcp-ai-pankaj' })