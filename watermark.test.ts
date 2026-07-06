import { PDFDocument, PageSizes } from "pdf-lib";
import { DocumentService } from "../services/document.service.js";

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

async function runTests() {
  console.log("=================================================");
  console.log("🚀 NIKPDF V2 AUTOMATED WATERMARK PDF TESTS");
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

  async function generateTestPdf(pagesCount: number, landscape = false) {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pagesCount; i++) {
      const page = pdfDoc.addPage(landscape ? [PageSizes.A4[1], PageSizes.A4[0]] : PageSizes.A4);
      page.drawText(`Page ${i + 1} Content`);
    }
    return Buffer.from(await pdfDoc.save());
  }

  // A tiny, valid 1x1 transparent PNG base64
  const testPngBase64 = "data:image/png;base64," + "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgGAAAAgABcyD8tAAAAABJRU5ErkJggg==";

  try {
    // ----------------------------------------------------
    // TEST 1: Small PDF Text Watermark
    // ----------------------------------------------------
    console.log("Running Test 1: Adding a Text Watermark to a small PDF...");
    const pdf1 = await generateTestPdf(2);
    const files1 = [createMockMulterFile("doc1.pdf", pdf1)];

    const res1 = await DocumentService.process(files1, "watermark-pdf", {
      type: "text",
      text: "STRICTLY PRIVATE",
      fontFamily: "Helvetica",
      fontSize: 50,
      bold: true,
      italic: true,
      underline: true,
      color: "#FF0000",
      opacity: 0.4,
      rotation: 45,
      alignment: "center"
    });
    assert(res1.success === true, "Text watermarking completed successfully");
    assert(res1.outputName === "doc1_watermarked.pdf", `Filename is correct: ${res1.outputName}`);

    const savedJob1 = DocumentService.getJob(res1.jobId)!;
    const doc1 = await PDFDocument.load(savedJob1.buffer);
    assert(doc1.getPageCount() === 2, "Watermarked PDF contains exactly 2 pages");

    // ----------------------------------------------------
    // TEST 2: Portrait vs Landscape Handling
    // ----------------------------------------------------
    console.log("\nRunning Test 2: Adding a Text Watermark to a Landscape PDF...");
    const pdfLandscape = await generateTestPdf(1, true);
    const filesLandscape = [createMockMulterFile("landscape.pdf", pdfLandscape)];

    const res2 = await DocumentService.process(filesLandscape, "watermark-pdf", {
      type: "text",
      text: "LANDSCAPE OVERLAY",
      alignment: "top-right",
      opacity: 0.5
    });
    assert(res2.success === true, "Landscape text watermarking completed successfully");
    
    // ----------------------------------------------------
    // TEST 3: 100-page PDF Watermark
    // ----------------------------------------------------
    console.log("\nRunning Test 3: Watermarking a 100-page PDF...");
    const pdf100 = await generateTestPdf(100);
    const files100 = [createMockMulterFile("doc100.pdf", pdf100)];
    
    const res3 = await DocumentService.process(files100, "watermark-pdf", {
      type: "text",
      text: "BATCH DRAFT",
      alignment: "tile",
      opacity: 0.2
    });
    assert(res3.success === true, "100-page batch text watermark success status is true");
    const doc3 = await PDFDocument.load(DocumentService.getJob(res3.jobId)!.buffer);
    assert(doc3.getPageCount() === 100, "Output document contains exactly 100 pages");

    // ----------------------------------------------------
    // TEST 4: 500-page PDF Watermark
    // ----------------------------------------------------
    console.log("\nRunning Test 4: Watermarking a 500-page PDF...");
    const pdf500 = await generateTestPdf(500);
    const files500 = [createMockMulterFile("doc500.pdf", pdf500)];
    
    const res4 = await DocumentService.process(files500, "watermark-pdf", {
      type: "text",
      text: "ARCHIVE ONLY",
      alignment: "bottom-left",
      opacity: 0.1
    });
    assert(res4.success === true, "500-page watermarking success is true");
    const doc4 = await PDFDocument.load(DocumentService.getJob(res4.jobId)!.buffer);
    assert(doc4.getPageCount() === 500, "Output document contains exactly 500 pages");

    // ----------------------------------------------------
    // TEST 5: Image Watermark - PNG
    // ----------------------------------------------------
    console.log("\nRunning Test 5: Adding a PNG Image Watermark...");
    const res5 = await DocumentService.process(files1, "watermark-pdf", {
      type: "image",
      image: testPngBase64,
      scale: 0.5,
      opacity: 0.5,
      alignment: "center"
    });
    assert(res5.success === true, "PNG Image watermarking completed successfully");
    const doc5 = await PDFDocument.load(DocumentService.getJob(res5.jobId)!.buffer);
    assert(doc5.getPageCount() === 2, "PNG watermarked PDF has correct page count");

    // ----------------------------------------------------
    // TEST 6: Image Watermark - Custom Position + Tile
    // ----------------------------------------------------
    console.log("\nRunning Test 6: Image Watermark Tile option...");
    const res6 = await DocumentService.process(files1, "watermark-pdf", {
      type: "image",
      image: testPngBase64,
      scale: 1.0,
      opacity: 0.15,
      alignment: "tile"
    });
    assert(res6.success === true, "Tiled Image watermarking completed successfully");

    // ----------------------------------------------------
    // TEST 7: Corrupted PDF validation
    // ----------------------------------------------------
    console.log("\nRunning Test 7: Corrupted PDF file rejection...");
    const corruptBuffer = Buffer.from("%PDF-1.4\nsome corrupt file structure");
    try {
      await DocumentService.process([createMockMulterFile("corrupt.pdf", corruptBuffer)], "watermark-pdf", {
        type: "text",
        text: "FAIL"
      });
      assert(false, "Should have rejected corrupted file");
    } catch (err: any) {
      assert(err.message.includes("corrupted") || err.message.includes("invalid"), `Correctly rejected corrupted PDF with error: "${err.message}"`);
    }

    // ----------------------------------------------------
    // TEST 8: Password protected PDF validation
    // ----------------------------------------------------
    console.log("\nRunning Test 8: Password protected PDF file rejection...");
    const encryptedBuffer = Buffer.from(
      "%PDF-1.4\n" +
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
      "3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n" +
      "4 0 obj\n<< /Filter /Standard /V 1 /R 2 /O (12345) /U (12345) /P -4 >>\nendobj\n" +
      "trailer\n<< /Root 1 0 R /Encrypt 4 0 R >>\n" +
      "%%EOF"
    );
    try {
      await DocumentService.process([createMockMulterFile("protected.pdf", encryptedBuffer)], "watermark-pdf", {
        type: "text",
        text: "FAIL"
      });
      assert(false, "Should have rejected password protected file");
    } catch (err: any) {
      assert(err.message.includes("password-protected") || err.message.includes("encrypted"), `Correctly rejected password protected PDF with error: "${err.message}"`);
    }

  } catch (err: any) {
    console.error("Test execution failed with critical error: ", err);
    failed++;
  }

  console.log("\n=========================================");
  console.log(`📊 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log("=========================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
