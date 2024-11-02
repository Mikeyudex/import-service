import { registerAs } from '@nestjs/config';

export default registerAs('config', () => {
    return {
        port: process.env.PORT,
        env: process.env.ENV,
        appName: process.env.APP_NAME,
        database: {
            uri: process.env.MONGODB_URI
        },
        oci: {
            bucketName: process.env.OCI_BUCKET_NAME,
            region: process.env.OCI_REGION,
        },
        apiKey: process.env.API_KEY,
        jwtSecret: process.env.JWT_SECRET
    }
});