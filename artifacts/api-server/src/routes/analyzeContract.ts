import { Router, type IRouter } from "express";
import multer from "multer";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are accepted"));
    }
  },
});

router.post("/analyze-contract", upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: "No file uploaded" });
    return;
  }

  res.json({
    success: true,
    fileName: req.file.originalname,
    message: "Contract uploaded successfully",
  });
});

export default router;
