import { PDFDocument, PageSizes } from "pdf-lib";
import { DocumentService } from "../services/document.service.js";
import JSZip from "jszip";

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
  console.log("🚀 NIKPDF V2 AUTOMATED PDF TO JPG TESTS");
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

  async function generateTestPdf(pagesCount: number, options: { landscape?: boolean; mixed?: boolean } = {}) {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pagesCount; i++) {
      let size = PageSizes.A4;
      if (options.mixed && i % 2 === 1) {
        size = PageSizes.Letter;
      }
      const page = pdfDoc.addPage(size);
      if (options.landscape) {
        page.setSize(842, 595);
      }
      page.drawText(`Page ${i + 1} Content`);
    }
    return Buffer.from(await pdfDoc.save());
  }

  try {
    // ----------------------------------------------------
    // TEST 1: Single Page PDF to JPG
    // ----------------------------------------------------
    console.log("Running Test 1: Single Page PDF to JPG...");
    const pdf1 = await generateTestPdf(1);
    const files1 = [createMockMulterFile("doc1.pdf", pdf1)];

    const res1 = await DocumentService.process(files1, "pdf-to-jpg", { pageMode: "all", dpi: 150, quality: "high" });
    assert(res1.success === true, "Single page conversion success status is true");
    assert(res1.outputName === "doc1_page_1.jpg", `Output filename is correct: ${res1.outputName}`);

    const savedJob1 = DocumentService.getJob(res1.jobId)!;
    assert(savedJob1.mimeType === "image/jpeg", "MIME type is image/jpeg");
    assert(savedJob1.buffer.length > 0, "JPG buffer has content");

    // ----------------------------------------------------
    // TEST 2: 10 Page PDF to JPG (produces ZIP)
    // ----------------------------------------------------
    console.log("\nRunning Test 2: 10 Page PDF to JPG (ZIP production)...");
    const pdf2 = await generateTestPdf(10);
    const files2 = [createMockMulterFile("doc2.pdf", pdf2)];

    const res2 = await DocumentService.process(files2, "pdf-to-jpg", { pageMode: "all", dpi: 72, quality: "medium" });
    assert(res2.success === true, "10-page conversion success status is true");
    assert(res2.outputName === "doc2_pages_jpg.zip", `ZIP output filename is correct: ${res2.outputName}`);

    const savedJob2 = DocumentService.getJob(res2.jobId)!;
    assert(savedJob2.mimeType === "application/zip", "MIME type is application/zip");

    const zip2 = await JSZip.loadAsync(savedJob2.buffer);
    const filesInZip2 = Object.keys(zip2.files);
    assert(filesInZip2.length === 10, `ZIP contains exactly 10 files, got ${filesInZip2.length}`);
    assert(filesInZip2.includes("doc2_page_1.jpg"), "ZIP includes page 1");
    assert(filesInZip2.includes("doc2_page_10.jpg"), "ZIP includes page 10");

    // ----------------------------------------------------
    // TEST 3: Page Range Conversion (e.g. 2-4 of 5 pages)
    // ----------------------------------------------------
    console.log("\nRunning Test 3: Page Range Conversion (pages 2-4 of 5)...");
    const pdf3 = await generateTestPdf(5);
    const files3 = [createMockMulterFile("doc3.pdf", pdf3)];

    const res3 = await DocumentService.process(files3, "pdf-to-jpg", { pageMode: "range", pageRange: "2-4", dpi: 150 });
    assert(res3.success === true, "Range conversion success status is true");

    const savedJob3 = DocumentService.getJob(res3.jobId)!;
    const zip3 = await JSZip.loadAsync(savedJob3.buffer);
    const filesInZip3 = Object.keys(zip3.files);
    assert(filesInZip3.length === 3, `Expected 3 images, got ${filesInZip3.length}`);
    assert(filesInZip3.includes("doc3_page_2.jpg"), "Includes page 2");
    assert(filesInZip3.includes("doc3_page_3.jpg"), "Includes page 3");
    assert(filesInZip3.includes("doc3_page_4.jpg"), "Includes page 4");

    // ----------------------------------------------------
    // TEST 4: Selected Pages Conversion (non-contiguous e.g. pages 1 and 3 of 4)
    // ----------------------------------------------------
    console.log("\nRunning Test 4: Selected Pages Conversion (non-contiguous pages 1,3 of 4)...");
    const pdf4 = await generateTestPdf(4);
    const files4 = [createMockMulterFile("doc4.pdf", pdf4)];

    const res4 = await DocumentService.process(files4, "pdf-to-jpg", { pageMode: "selected", selectedPages: [1, 3], dpi: 72 });
    assert(res4.success === true, "Selected pages conversion success status is true");

    const savedJob4 = DocumentService.getJob(res4.jobId)!;
    const zip4 = await JSZip.loadAsync(savedJob4.buffer);
    const filesInZip4 = Object.keys(zip4.files);
    assert(filesInZip4.length === 2, `Expected 2 images, got ${filesInZip4.length}`);
    assert(filesInZip4.includes("doc4_page_1.jpg"), "Includes page 1");
    assert(filesInZip4.includes("doc4_page_3.jpg"), "Includes page 3");

    // ----------------------------------------------------
    // TEST 5: Large PDF Conversion (Simulated 100 & 500 Page fast extraction)
    // ----------------------------------------------------
    console.log("\nRunning Test 5: Large 100-page and 500-page PDF lazy rendering test...");
    const pdf100 = await generateTestPdf(100);
    const files100 = [createMockMulterFile("doc100.pdf", pdf100)];

    // Convert only a single page of a 100-page PDF to test performance and memory protection
    const res100 = await DocumentService.process(files100, "pdf-to-jpg", { pageMode: "single", singlePage: 50, dpi: 72 });
    assert(res100.success === true, "100-page single page conversion success status is true");
    assert(res100.outputName === "doc100_page_50.jpg", `Correct output name: ${res100.outputName}`);

    const pdf500 = await generateTestPdf(500);
    const files500 = [createMockMulterFile("doc500.pdf", pdf500)];
    const res500 = await DocumentService.process(files500, "pdf-to-jpg", { pageMode: "single", singlePage: 500, dpi: 72 });
    assert(res500.success === true, "500-page single page conversion success status is true");
    assert(res500.outputName === "doc500_page_500.jpg", `Correct output name: ${res500.outputName}`);

    // ----------------------------------------------------
    // TEST 6: Portrait vs Landscape vs Mixed Sizes Conversion
    // ----------------------------------------------------
    console.log("\nRunning Test 6: Landscape, Portrait, and Mixed Sizes Conversion...");
    const landscapePdf = await generateTestPdf(1, { landscape: true });
    const landscapeFiles = [createMockMulterFile("landscape.pdf", landscapePdf)];
    const landscapeRes = await DocumentService.process(landscapeFiles, "pdf-to-jpg", { pageMode: "all", dpi: 150 });
    assert(landscapeRes.success === true, "Landscape page converted successfully");

    const mixedPdf = await generateTestPdf(3, { mixed: true });
    const mixedFiles = [createMockMulterFile("mixed.pdf", mixedPdf)];
    const mixedRes = await DocumentService.process(mixedFiles, "pdf-to-jpg", { pageMode: "all", dpi: 150 });
    assert(mixedRes.success === true, "Mixed sizes pages converted successfully");

    // ----------------------------------------------------
    // TEST 7: Rejection of Password-Protected PDFs
    // ----------------------------------------------------
    console.log("\nRunning Test 7: Rejection of Password-Protected PDF...");
    const sourcePdf = await generateTestPdf(2);
    const protectedRes = await DocumentService.process([createMockMulterFile("src.pdf", sourcePdf)], "protect-pdf", {
      userPassword: "secretPassword123!",
      ownerPassword: "adminPassword123!",
      encryption: "128",
      allowPrinting: true,
      allowCopy: true,
    });
    const encryptedPdfBuffer = DocumentService.getJob(protectedRes.jobId)!.buffer;
    const protectedFiles = [createMockMulterFile("protected.pdf", encryptedPdfBuffer)];

    try {
      await DocumentService.process(protectedFiles, "pdf-to-jpg", { pageMode: "all" });
      assert(false, "Should have thrown an error for password protected PDF");
    } catch (err: any) {
      assert(
        err.message.includes("Password Protected PDF") || err.message.includes("password-protected"),
        `Correctly rejected password protected PDF with error: "${err.message}"`
      );
    }

    // ----------------------------------------------------
    // TEST 8: Rejection of Corrupted PDFs
    // ----------------------------------------------------
    console.log("\nRunning Test 8: Rejection of Corrupted PDF...");
    const corruptBuffer = Buffer.from("Not a valid PDF at all... just random text here!");
    const corruptFiles = [createMockMulterFile("corrupted.pdf", corruptBuffer)];

    try {
      await DocumentService.process(corruptFiles, "pdf-to-jpg", { pageMode: "all" });
      assert(false, "Should have thrown an error for corrupted PDF");
    } catch (err: any) {
      assert(
        err.message.includes("Invalid PDF") || err.message.includes("corrupted"),
        `Correctly rejected corrupted PDF with error: "${err.message}"`
      );
    }

    // ----------------------------------------------------
    // TEST 9: Rejection of Empty PDFs
    // ----------------------------------------------------
    console.log("\nRunning Test 9: Rejection of Empty PDF...");
    const emptyFiles = [createMockMulterFile("empty.pdf", Buffer.alloc(0))];

    try {
      await DocumentService.process(emptyFiles, "pdf-to-jpg", { pageMode: "all" });
      assert(false, "Should have thrown an error for empty PDF");
    } catch (err: any) {
      assert(
        err.message.includes("Empty File") || err.message.includes("empty"),
        `Correctly rejected empty PDF with error: "${err.message}"`
      );
    }

  } catch (globalErr: any) {
    console.error("Global Test Error:", globalErr);
    failed++;
  }

  console.log("\n=========================================");
  console.log("📊 TEST RESULTS SUMMARY");
  console.log("=========================================");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Status: ${failed === 0 ? "PASS" : "FAIL"}`);
  console.log("=========================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
