import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = process.env.UPLOAD_PATH || './uploads';

const createUploadDirs = () => {
  const dirs = [
    `${uploadDir}/proofs`,
    `${uploadDir}/excel`,
    `${uploadDir}/bills`,
    `${uploadDir}/statements`,
    `${uploadDir}/temp`
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

createUploadDirs();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'temp';
    
    if (file.fieldname === 'proof') folder = 'proofs';
    else if (file.fieldname === 'excel' || file.fieldname === 'file') folder = 'excel';
    else if (file.fieldname === 'bill') folder = 'bills';
    else if (file.fieldname === 'statement') folder = 'statements';
    
    cb(null, `${uploadDir}/${folder}`);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedImageTypes = /jpeg|jpg|png|webp|pdf/;
  const allowedExcelTypes = /xls|xlsx/;
  
  const extname = path.extname(file.originalname).toLowerCase();
  
  if (file.fieldname === 'proof' || file.fieldname === 'bill' || file.fieldname === 'statement') {
    if (allowedImageTypes.test(extname.substring(1))) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, WEBP, and PDF files are allowed for proofs'));
    }
  } else if (file.fieldname === 'excel' || file.fieldname === 'file') {
    if (allowedExcelTypes.test(extname.substring(1))) {
      cb(null, true);
    } else {
      cb(new Error('Only XLS and XLSX files are allowed for uploads'));
    }
  } else {
    cb(null, true);
  }
};

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024
  },
  fileFilter: fileFilter
});

export default upload;
