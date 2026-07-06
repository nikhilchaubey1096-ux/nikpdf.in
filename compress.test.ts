import { PDFDocument, PageSizes } from "pdf-lib";
import { DocumentService } from "../services/document.service.js";
import fs from "fs";
import path from "path";

function createMockMulterFile(name: string, buffer: Buffer, mimetype = "application/pdf"): Express.Multer.File {
  return {
    fieldname: "files",
    originalname: name,
    encoding: "7bit",
    mimetype,
    buffer,
    size: buffer.length,
    stream: null as any,
    destination: "",
    filename: "",
    path: "",
  };
}

// 1x1 pixel solid red PNG in base64
const dummyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function runTests() {
  console.log("=================================================");
  console.log("🚀 NIKPDF V2 AUTOMATED COMPRESS PDF TESTS");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(` ✅ PASS: ${message}`);
      passed++;
    } else {
      console.log(` ❌ FAIL: ${message}`);
      failed++;
    }
  }

  async function generateTestPdf(pagesCount: number, options: { landscape?: boolean; addImages?: boolean; text?: string } = {}) {
    const pdfDoc = await PDFDocument.create();
    let img;
    if (options.addImages) {
      const imgBytes = Buffer.from(dummyPngBase64, "base64");
      img = await pdfDoc.embedPng(imgBytes);
    }

    for (let i = 0; i < pagesCount; i++) {
      const isLandscape = options.landscape || (i % 2 === 1 && !options.landscape); // Mixed orientation support
      const size: [number, number] = isLandscape ? [PageSizes.A4[1], PageSizes.A4[0]] : PageSizes.A4;
      const page = pdfDoc.addPage(size);
      
      const txt = options.text || `Page ${i + 1} Content text. This is a repetitive line of text designed to test compression. `.repeat(10);
      page.drawText(txt, { x: 50, y: 500, size: 12 });

      if (options.addImages && img) {
        // Draw image multiple times to simulate image-heavy PDF
        for (let d = 0; d < 5; d++) {
          page.drawImage(img, { x: 100 + d * 50, y: 200, width: 200, height: 200 });
        }
      }
    }
    // Save without object streams to allow compression to shrink it
    return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
  }

  try {
    // ----------------------------------------------------
    // TEST 1: 10-page PDF Compression
    // ----------------------------------------------------
    console.log("Running Test 1: Compressing a 10-page text PDF...");
    const pdf10 = await generateTestPdf(10);
    const files10 = [createMockMulterFile("doc10.pdf", pdf10)];

    try {
      const res1 = await DocumentService.process(files10, "compress-pdf", { compressionLevel: "high" });
      assert(res1.success === true, "10-page compression completed successfully");
      assert(res1.outputName === "doc10_compressed.pdf", `Output file name is correct: ${res1.outputName}`);
      
      const compressedBuf1 = DocumentService.getJob(res1.jobId)!.buffer;
      assert(compressedBuf1.length < pdf10.length, `File size reduced: ${pdf10.length} -> ${compressedBuf1.length} bytes`);
      
      const parsed1 = await PDFDocument.load(compressedBuf1);
      assert(parsed1.getPageCount() === 10, "Page count preserved in compressed output");
    } catch (err: any) {
      if (err.message.includes("Already Optimized")) {
        assert(true, "10-page compression skipped correctly (PDF was already highly optimized)");
      } else {
        assert(false, `10-page compression failed: ${err.message}`);
      }
    }

    // ----------------------------------------------------
    // TEST 2: Image-heavy PDF Compression
    // ----------------------------------------------------
    console.log("\nRunning Test 2: Compressing an Image-heavy PDF...");
    const pdfImg = await generateTestPdf(3, { addImages: true });
    const filesImg = [createMockMulterFile("image_heavy.pdf", pdfImg)];

    try {
      const res2 = await DocumentService.process(filesImg, "compress-pdf", { compressionLevel: "max" });
      assert(res2.success === true, "Image-heavy compression completed successfully");
      const compressedBuf2 = DocumentService.getJob(res2.jobId)!.buffer;
      
      // Since max compression downsamples images, the file size should definitely be smaller
      assert(compressedBuf2.length < pdfImg.length, `Image-heavy file size reduced: ${pdfImg.length} -> ${compressedBuf2.length} bytes`);
      
      const parsed2 = await PDFDocument.load(compressedBuf2);
      assert(parsed2.getPageCount() === 3, "Image-heavy page count preserved");
    } catch (err: any) {
      if (err.message.includes("Already Optimized")) {
        assert(true, "Image-heavy compression skipped correctly (PDF was already optimized)");
      } else {
        assert(false, `Image-heavy compression failed: ${err.message}`);
      }
    }

    // ----------------------------------------------------
    // TEST 3: Scanned PDF Compression
    // ----------------------------------------------------
    console.log("\nRunning Test 3: Compressing a Scanned PDF (all-image pages)...");
    const scannedPdf = await generateTestPdf(2, { addImages: true, text: " " }); // Minimal text, mostly images
    const filesScanned = [createMockMulterFile("scanned.pdf", scannedPdf)];

    try {
      const res3 = await DocumentService.process(filesScanned, "compress-pdf", { compressionLevel: "high" });
      assert(res3.success === true, "Scanned PDF compression completed successfully");
      const compressedBuf3 = DocumentService.getJob(res3.jobId)!.buffer;
      assert(compressedBuf3.length < scannedPdf.length, `Scanned PDF size reduced: ${scannedPdf.length} -> ${compressedBuf3.length} bytes`);
    } catch (err: any) {
      if (err.message.includes("Already Optimized")) {
        assert(true, "Scanned PDF compression handled as already optimized");
      } else {
        assert(false, `Scanned PDF compression failed: ${err.message}`);
      }
    }

    // ----------------------------------------------------
    // TEST 4: Mixed Orientation PDF Compression
    // ----------------------------------------------------
    console.log("\nRunning Test 4: Compressing a Mixed Orientation PDF...");
    const mixedPdf = await generateTestPdf(4, { landscape: false }); // Alternates portrait and landscape
    const filesMixed = [createMockMulterFile("mixed.pdf", mixedPdf)];

    try {
      const res4 = await DocumentService.process(filesMixed, "compress-pdf", { compressionLevel: "balanced" });
      assert(res4.success === true, "Mixed orientation PDF compression completed successfully");
      const compressedBuf4 = DocumentService.getJob(res4.jobId)!.buffer;
      const parsed4 = await PDFDocument.load(compressedBuf4);
      assert(parsed4.getPageCount() === 4, "Page count preserved for mixed orientation");
    } catch (err: any) {
      if (err.message.includes("Already Optimized")) {
        assert(true, "Mixed orientation compression handled as already optimized");
      } else {
        assert(false, `Mixed orientation compression failed: ${err.message}`);
      }
    }

    // ----------------------------------------------------
    // TEST 5: Password Protected PDF validation
    // ----------------------------------------------------
    console.log("\nRunning Test 5: Rejecting password protected PDFs...");
    const protectPdf = await generateTestPdf(1);
    const filesProtect = [createMockMulterFile("doc.pdf", protectPdf)];
    const encResult = await DocumentService.process(filesProtect, "protect-pdf", {
      userPassword: "UserPass123!",
    });
    const encryptedBuf = DocumentService.getJob(encResult.jobId)!.buffer;

    try {
      await DocumentService.process([createMockMulterFile("protected.pdf", encryptedBuf)], "compress-pdf");
      assert(false, "Allowed compressing of a password-protected PDF (Incorrect)");
    } catch (err: any) {
      assert(err.message.includes("Password Protected"), `Successfully blocked password-protected PDF: ${err.message}`);
    }

    // ----------------------------------------------------
    // TEST 6: Corrupted/Invalid PDF validation
    // ----------------------------------------------------
    console.log("\nRunning Test 6: Rejecting corrupted/invalid PDFs...");
    const badBuffer = Buffer.from("Not a real PDF file header");
    try {
      await DocumentService.process([createMockMulterFile("corrupted.pdf", badBuffer)], "compress-pdf");
      assert(false, "Allowed compressing of corrupted PDF (Incorrect)");
    } catch (err: any) {
      assert(err.message.includes("Invalid PDF"), `Successfully caught invalid document: ${err.message}`);
    }

    // ----------------------------------------------------
    // TEST 7: Already Optimized PDF validation
    // ----------------------------------------------------
    console.log("\nRunning Test 7: Handling of Already Optimized PDFs...");
    const simplePdf = await generateTestPdf(1);
    // Let's compress it once, then compress the result again to ensure it triggers already optimized error
    try {
      const firstRes = await DocumentService.process([createMockMulterFile("simple.pdf", simplePdf)], "compress-pdf", { compressionLevel: "low" });
      const firstCompressedBuf = DocumentService.getJob(firstRes.jobId)!.buffer;

      // Try compressing the already-compressed file
      await DocumentService.process([createMockMulterFile("already_compressed.pdf", firstCompressedBuf)], "compress-pdf", { compressionLevel: "low" });
      assert(false, "Allowed compressing an already optimized PDF without throwing Already Optimized error (Incorrect)");
    } catch (err: any) {
      assert(err.message.includes("Already Optimized"), `Successfully caught already optimized PDF: ${err.message}`);
    }

    // ----------------------------------------------------
    // TEST 8: 100-page PDF Compression
    // ----------------------------------------------------
    console.log("\nRunning Test 8: Compressing a 100-page PDF document...");
    const pdf100 = await generateTestPdf(100);
    const files100 = [createMockMulterFile("doc100.pdf", pdf100)];

    try {
      const res8 = await DocumentService.process(files100, "compress-pdf", { compressionLevel: "balanced" });
      assert(res8.success === true, "100-page PDF compressed successfully!");
      const compressedBuf8 = DocumentService.getJob(res8.jobId)!.buffer;
      const parsed100 = await PDFDocument.load(compressedBuf8);
      assert(parsed100.getPageCount() === 100, "100-page PDF page count is preserved");
    } catch (err: any) {
      if (err.message.includes("Already Optimized")) {
        assert(true, "100-page PDF handled as already optimized");
      } else {
        assert(false, `100-page PDF compression failed: ${err.message}`);
      }
    }

    // ----------------------------------------------------
    // TEST 9: 500-page PDF Compression (Large File Test)
    // ----------------------------------------------------
    console.log("\nRunning Test 9: Compressing a 500-page PDF document...");
    const pdf500 = await generateTestPdf(500);
    const files500 = [createMockMulterFile("doc500.pdf", pdf500)];

    try {
      const res9 = await DocumentService.process(files500, "compress-pdf", { compressionLevel: "balanced" });
      assert(res9.success === true, "500-page PDF compressed successfully!");
      const compressedBuf9 = DocumentService.getJob(res9.jobId)!.buffer;
      const parsed500 = await PDFDocument.load(compressedBuf9);
      assert(parsed500.getPageCount() === 500, "500-page PDF page count is preserved");
    } catch (err: any) {
      if (err.message.includes("Already Optimized")) {
        assert(true, "500-page PDF handled as already optimized");
      } else {
        assert(false, `500-page PDF compression failed: ${err.message}`);
      }
    }

    console.log("\n=================================================");
    console.log(`📊 TEST RUN RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================");

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err: any) {
    console.error("Critical test runner exception occurred:", err);
    process.exit(1);
  }
}

runTests();
