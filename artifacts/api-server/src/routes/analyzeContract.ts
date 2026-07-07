import { Router, type IRouter } from "express";
import multer from "multer";
import { parseContractPdf } from "../services/documentParser";

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

router.post("/analyze-contract", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: "No file uploaded" });
    return;
  }

  try {
    const parsed = await parseContractPdf(req.file.buffer);

    res.json({
      success: true,
      fileName: req.file.originalname,
      message: "PDF text extracted successfully",
      textPreview: parsed.textPreview,
      textLength: parsed.textLength,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    res.status(422).json({ success: false, message });
  }
});

export default router;
