import { Router, type IRouter } from "express";
import multer from "multer";
import { parseContractPdf } from "../services/documentParser";
import { maskPii } from "../services/piiMasker";

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
    // Stage 1: Extract text from PDF
    const parsed = await parseContractPdf(req.file.buffer);

    // Stage 2: Mask PII before any future AI processing
    const masked = maskPii(parsed.text);

    // DEV NOTE: dual output (rawText + maskedText) is temporary — remove before production
    res.json({
      success: true,
      fileName: req.file.originalname,
      message: "PDF processed and PII masked successfully",
      textLength: parsed.textLength,
      textPreview: parsed.textPreview,
      maskedTextPreview: masked.maskedText.slice(0, 1000),
      piiStatistics: masked.statistics,
      // TODO: remove rawText from response before production
      _dev_rawText: parsed.text,
      _dev_maskedText: masked.maskedText,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    res.status(422).json({ success: false, message });
  }
});

export default router;
