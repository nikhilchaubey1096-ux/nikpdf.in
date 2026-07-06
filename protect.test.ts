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
  console.log("🚀 NIKPDF V2 AUTOMATED PROTECT PDF TESTS");
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

  try {
    // ----------------------------------------------------
    // TEST 1: Protect PDF (128-bit key)
    // ----------------------------------------------------
    console.log("Running Test 1: Encrypting a small PDF with 128-bit RC4 and User password...");
    const pdf1 = await generateTestPdf(2);
    const files1 = [createMockMulterFile("doc1.pdf", pdf1)];

    const res1 = await DocumentService.process(files1, "protect-pdf", {
      userPassword: "user123Pass!",
      ownerPassword: "owner123Pass!",
      encryption: "128",
      allowPrinting: true,
      allowCopy: false,
    });
    
    assert(res1.success === true, "128-bit encryption completed successfully");
    assert(res1.outputName === "doc1_protected.pdf", `Output file name correct: ${res1.outputName}`);

    const job1 = DocumentService.getJob(res1.jobId)!;
    assert(job1.buffer !== null, "Output buffer generated successfully");

    // Loading standard without key should fail
    try {
      await PDFDocument.load(job1.buffer);
      assert(false, "Encrypted PDF loaded successfully without key (This is incorrect)");
    } catch (err: any) {
      assert(err.message.includes("encrypted"), "PDF loader correctly failed because file is encrypted");
    }

    // ----------------------------------------------------
    // TEST 2: Protect PDF (256-bit AES) with Custom Permissions
    // ----------------------------------------------------
    console.log("\nRunning Test 2: Encrypting with 256-bit AES & full permissions restrictions...");
    const pdf2 = await generateTestPdf(1);
    const files2 = [createMockMulterFile("doc2.pdf", pdf2)];

    const res2 = await DocumentService.process(files2, "protect-pdf", {
      userPassword: "User99_Secure_Key!",
      ownerPassword: "Owner99_Admin_Key!",
      encryption: "256",
      allowPrinting: false,
      allowCopy: false,
      allowEditing: false,
      allowComments: false,
      allowFormFilling: false,
      allowAccessibility: true, // Only allow screen readers
      allowDocumentAssembly: false,
    });

    assert(res2.success === true, "256-bit AES encryption completed successfully");
    const job2 = DocumentService.getJob(res2.jobId)!;
    try {
      await PDFDocument.load(job2.buffer);
      assert(false, "256-bit encrypted PDF loaded successfully without key (This is incorrect)");
    } catch (err: any) {
      assert(err.message.includes("encrypted"), "256-bit AES PDF correctly blocked unauthenticated reads");
    }

    // ----------------------------------------------------
    // TEST 3: Prevent Protect Already Protected PDF
    // ----------------------------------------------------
    console.log("\nRunning Test 3: Attempting to encrypt an already password-protected PDF...");
    const files3 = [createMockMulterFile("doc3_encrypted.pdf", job2.buffer)];
    try {
      await DocumentService.process(files3, "protect-pdf", {
        userPassword: "anotherPassword99!"
      });
      assert(false, "Allowed double-encryption of a protected PDF (Incorrect)");
    } catch (err: any) {
      assert(err.message.includes("Already Protected PDF"), `Successfully blocked: ${err.message}`);
    }

    // ----------------------------------------------------
    // TEST 4: Prevent Protect Invalid/Corrupted PDF
    // ----------------------------------------------------
    console.log("\nRunning Test 4: Attempting to encrypt a corrupted/invalid PDF file...");
    const badBuffer = Buffer.from("Not a real PDF header content");
    const files4 = [createMockMulterFile("corrupted.pdf", badBuffer)];
    try {
      await DocumentService.process(files4, "protect-pdf", {
        userPassword: "userSecureKey99!"
      });
      assert(false, "Allowed encryption of corrupted file (Incorrect)");
    } catch (err: any) {
      assert(err.message.includes("Invalid PDF"), `Successfully caught invalid document: ${err.message}`);
    }

    // ----------------------------------------------------
    // TEST 5: Password Validations (Weak Passwords)
    // ----------------------------------------------------
    console.log("\nRunning Test 5: Reverting weak or matching passwords...");
    const pdf5 = await generateTestPdf(1);
    const files5 = [createMockMulterFile("doc5.pdf", pdf5)];

    // Too short
    try {
      await DocumentService.process(files5, "protect-pdf", {
        userPassword: "123"
      });
      assert(false, "Allowed 3-character password (Incorrect)");
    } catch (err: any) {
      assert(err.message.includes("Weak Password") || err.message.includes("Password Required"), `Successfully caught short password: ${err.message}`);
    }

    // Weak strength (no special/numbers/case mix) when enforceStrong is active
    try {
      await DocumentService.process(files5, "protect-pdf", {
        userPassword: "weakpassword",
        enforceStrong: true
      });
      assert(false, "Allowed weak lowercase-only password (Incorrect)");
    } catch (err: any) {
      assert(err.message.includes("Weak Password"), `Successfully rejected weak password layout: ${err.message}`);
    }

    // User & Owner passwords equal
    try {
      await DocumentService.process(files5, "protect-pdf", {
        userPassword: "UserSecurePass123!",
        ownerPassword: "UserSecurePass123!"
      });
      assert(false, "Allowed identical user and owner passwords (Incorrect)");
    } catch (err: any) {
      assert(err.message.includes("Weak Password") || err.message.includes("password"), `Successfully rejected matching passwords: ${err.message}`);
    }

    // ----------------------------------------------------
    // TEST 6: 100-page PDF Encryption
    // ----------------------------------------------------
    console.log("\nRunning Test 6: Encrypting a large 100-page PDF document...");
    const pdf100 = await generateTestPdf(100);
    const files100 = [createMockMulterFile("large100.pdf", pdf100)];
    
    const res6 = await DocumentService.process(files100, "protect-pdf", {
      userPassword: "largeDocPassword123!",
      encryption: "256"
    });
    assert(res6.success === true, "100-page document password-protection completed successfully!");

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
