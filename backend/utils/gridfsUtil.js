const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

let gridFSBucket = null;

const initializeGridFS = (connection) => {
  if (!gridFSBucket && connection.readyState === 1) {
    gridFSBucket = new GridFSBucket(connection.getClient().db(connection.name));
  }
  return gridFSBucket;
};

const uploadToGridFS = async (connection, filename, fileBuffer, metadata = {}) => {
  const bucket = initializeGridFS(connection);
  if (!bucket) throw new Error('GridFS bucket not initialized');

  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, {
      metadata: {
        uploadedAt: new Date(),
        ...metadata,
      },
    });

    uploadStream.on('error', reject);
    uploadStream.on('finish', () => {
      resolve(uploadStream.id.toString());
    });

    uploadStream.end(fileBuffer);
  });
};

const downloadFromGridFS = async (connection, fileId) => {
  const bucket = initializeGridFS(connection);
  if (!bucket) throw new Error('GridFS bucket not initialized');

  return new Promise((resolve, reject) => {
    const chunks = [];
    const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));

    downloadStream.on('error', reject);
    downloadStream.on('data', (chunk) => chunks.push(chunk));
    downloadStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });
};

const deleteFromGridFS = async (connection, fileId) => {
  const bucket = initializeGridFS(connection);
  if (!bucket) throw new Error('GridFS bucket not initialized');

  return new Promise((resolve, reject) => {
    bucket.delete(new mongoose.Types.ObjectId(fileId), (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

const getFileMetadata = async (connection, fileId) => {
  const bucket = initializeGridFS(connection);
  if (!bucket) throw new Error('GridFS bucket not initialized');

  const files = await bucket.find({ _id: new mongoose.Types.ObjectId(fileId) }).toArray();
  return files.length > 0 ? files[0] : null;
};

module.exports = {
  initializeGridFS,
  uploadToGridFS,
  downloadFromGridFS,
  deleteFromGridFS,
  getFileMetadata,
};
