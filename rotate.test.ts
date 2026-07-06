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
  console.log("========================================");
  console.log("🚀 NIKPDF V2 AUTOMATED ROTATE PDF TESTS");
  console.log("========================================\n");

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

  async function generateTestPdf(pagesCount: number) {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pagesCount; i++) {
      pdfDoc.addPage(PageSizes.A4);
    }
    return Buffer.from(await pdfDoc.save());
  }

  try {
    // ----------------------------------------------------
    // TEST 1: Rotate all pages (90° Clockwise)
    // ----------------------------------------------------
    console.log("Running Test 1: Rotate all pages (90° CW)...");
    const pdf1 = await generateTestPdf(3);
    const files1 = [createMockMulterFile("doc1.pdf", pdf1)];

    const res1 = await DocumentService.process(files1, "rotate-pdf", { rotateMode: "all", angle: 90, direction: "cw" });
    assert(res1.success === true, "Rotate all pages response success status is true");
    assert(res1.outputName === "doc1_rotated.pdf", `Output filename is correct: ${res1.outputName}`);

    const savedJob1 = DocumentService.getJob(res1.jobId)!;
    const doc1 = await PDFDocument.load(savedJob1.buffer);
    assert(doc1.getPageCount() === 3, "Output document has exactly 3 pages");
    assert(doc1.getPage(0).getRotation().angle === 90, "Page 0 rotated by 90 degrees");
    assert(doc1.getPage(1).getRotation().angle === 90, "Page 1 rotated by 90 degrees");
    assert(doc1.getPage(2).getRotation().angle === 90, "Page 2 rotated by 90 degrees");

    // ----------------------------------------------------
    // TEST 2: Rotate all pages (90° Counter-Clockwise / 270° CW)
    // ----------------------------------------------------
    console.log("\nRunning Test 2: Rotate all pages (90° CCW -> 270° CW)...");
    const res2 = await DocumentService.process(files1, "rotate-pdf", { rotateMode: "all", angle: 90, direction: "ccw" });
    assert(res2.success === true, "Rotate all pages CCW response success is true");
    const savedJob2 = DocumentService.getJob(res2.jobId)!;
    const doc2 = await PDFDocument.load(savedJob2.buffer);
    assert(doc2.getPage(0).getRotation().angle === 270, "Page 0 rotated to 270 degrees (90° CCW)");

    // ----------------------------------------------------
    // TEST 3: Rotate selected pages
    // ----------------------------------------------------
    console.log("\nRunning Test 3: Rotate selected pages (pages 1 and 3 by 180°)...");
    const res3 = await DocumentService.process(files1, "rotate-pdf", { rotateMode: "selected", selectedPages: "1,3", angle: 180, direction: "cw" });
    assert(res3.success === true, "Rotate selected pages response success is true");
    const savedJob3 = DocumentService.getJob(res3.jobId)!;
    const doc3 = await PDFDocument.load(savedJob3.buffer);
    assert(doc3.getPage(0).getRotation().angle === 180, "Page 0 rotated by 180 degrees");
    assert(doc3.getPage(1).getRotation().angle === 0, "Page 1 left un-rotated (0 degrees)");
    assert(doc3.getPage(2).getRotation().angle === 180, "Page 2 rotated by 180 degrees");

    // ----------------------------------------------------
    // TEST 4: Rotate Odd Pages
    // ----------------------------------------------------
    console.log("\nRunning Test 4: Rotate Odd Pages (90° CW)...");
    const res4 = await DocumentService.process(files1, "rotate-pdf", { rotateMode: "odd", angle: 90, direction: "cw" });
    assert(res4.success === true, "Rotate odd pages response success is true");
    const savedJob4 = DocumentService.getJob(res4.jobId)!;
    const doc4 = await PDFDocument.load(savedJob4.buffer);
    assert(doc4.getPage(0).getRotation().angle === 90, "Page 0 (Odd 1) rotated by 90 degrees");
    assert(doc4.getPage(1).getRotation().angle === 0, "Page 1 (Even 2) left at 0 degrees");
    assert(doc4.getPage(2).getRotation().angle === 90, "Page 2 (Odd 3) rotated by 90 degrees");

    // ----------------------------------------------------
    // TEST 5: Rotate Even Pages
    // ----------------------------------------------------
    console.log("\nRunning Test 5: Rotate Even Pages (90° CW)...");
    const res5 = await DocumentService.process(files1, "rotate-pdf", { rotateMode: "even", angle: 90, direction: "cw" });
    assert(res5.success === true, "Rotate even pages response success is true");
    const savedJob5 = DocumentService.getJob(res5.jobId)!;
    const doc5 = await PDFDocument.load(savedJob5.buffer);
    assert(doc5.getPage(0).getRotation().angle === 0, "Page 0 (Odd 1) left at 0 degrees");
    assert(doc5.getPage(1).getRotation().angle === 90, "Page 1 (Even 2) rotated by 90 degrees");
    assert(doc5.getPage(2).getRotation().angle === 0, "Page 2 (Odd 3) left at 0 degrees");

    // ----------------------------------------------------
    // TEST 6: Validation - Invalid Page Number
    // ----------------------------------------------------
    console.log("\nRunning Test 6: Page Range Validation (exceeding page limit)...");
    try {
      await DocumentService.process(files1, "rotate-pdf", { rotateMode: "selected", selectedPages: "5", angle: 90 });
      assert(false, "Should have thrown an error for page exceeding total pages");
    } catch (err: any) {
      assert(
        err.message.includes("exceeds total document pages") || err.message.includes("Invalid page number"),
        `Correctly threw error for exceeding pages: "${err.message}"`
      );
    }

    // ----------------------------------------------------
    // TEST 7: Password-protected PDF rejection
    // ----------------------------------------------------
    console.log("\nRunning Test 7: Rejection of password-protected files...");
    const encryptedBuffer = Buffer.from(
      "%PDF-1.4\n" +
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
      "3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n" +
      "4 0 obj\n<< /Filter /Standard /V 1 /R 2 /O (12345) /U (12345) /P -4 >>\nendobj\n" +
      "trailer\n<< /Root 1 0 R /Encrypt 4 0 R >>\n" +
      "%%EOF"
    );
    const files7 = [createMockMulterFile("protected.pdf", encryptedBuffer)];
    try {
      await DocumentService.process(files7, "rotate-pdf", { rotateMode: "all", angle: 90 });
      assert(false, "Should have thrown an error for encrypted file");
    } catch (err: any) {
      assert(
        err.message.includes("password-protected") || err.message.includes("encrypted"),
        `Correctly rejected encrypted file with error message: "${err.message}"`
      );
    }

    // ----------------------------------------------------
    // TEST 8: Corrupted PDF rejection
    // ----------------------------------------------------
    console.log("\nRunning Test 8: Rejection of corrupted files...");
    const corruptBuffer = Buffer.from("%PDF-1.4\ncorrupted file body contents");
    const files8 = [createMockMulterFile("corrupt.pdf", corruptBuffer)];
    try {
      await DocumentService.process(files8, "rotate-pdf", { rotateMode: "all", angle: 90 });
      assert(false, "Should have thrown an error for corrupt file");
    } catch (err: any) {
      assert(
        err.message.includes("corrupted") || err.message.includes("Failed to process") || err.message.includes("invalid") || err.message.includes("Cannot read properties") || err.message.includes("PDFDocument"),
        `Correctly rejected corrupted file with error: "${err.message}"`
      );
    }

  } catch (err: any) {
    console.error("Test execution failed with critical error: ", err);
    failed++;
  }

  console.log("\n========================================");
  console.log(`📊 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log("========================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
