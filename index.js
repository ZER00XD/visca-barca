import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app    = express();
const upload = multer({ storage: multer.memoryStorage() });
const BUCKET = "ptolemaicfilesharing";
const REGION = "eu-north-1";
const s3     = new S3Client({ region: REGION });


app.post('/upload', upload.array('files', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
        success: false,
        message: 'No files uploaded'
    });
  }
  try {
    const downloadURLs = [];
    for (const file of req.files) {
      const key = `${Date.now()}_${file.originalname}`;
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }));
      const downloadUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: BUCKET, Key: key }),
        { expiresIn: 3600 }
      );
      downloadURLs.push(downloadUrl);
    }
    res.json(downloadURLs);
  }catch(e){
    res.status(500).json({
      success: false,
      message: e.message
    });
  }
});

// ← NEW: list all objects and return signed URLs
app.get('/files', async (req, res) => {
  try {
    const { Contents = [] } = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET
    }));

    const files = await Promise.all(
      Contents.map(async item => {
        // generate a signed URL
        const url = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: BUCKET, Key: item.Key }),
          { expiresIn: 3600 }
        );

        return {
          key:          item.Key,
          size:         item.Size,                          // size in bytes
          lastModified: item.LastModified.toISOString(),    // upload date
          url
        };
      })
    );

    res.json(files);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


app.use(express.static(path.join(__dirname, 'frontend/')));

const PORT = process.env.PORT || 80;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
