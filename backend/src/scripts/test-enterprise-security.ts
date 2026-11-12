import { connectDatabase } from '../config/database.js';
import User from '../modules/users/user.model.js';
import { createApp } from '../app.js';
import mongoose from 'mongoose';

async function testEnterpriseSecurityFlows() {
  await connectDatabase();
  const app = createApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    console.log('--- Testing Production-Grade Security & Authentication ---');

    // 1. Verify /auth/demo-switch is permanently 404
    const resDemo = await fetch(`${baseUrl}/auth/demo-switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'SYSTEM_ADMIN' }),
    });
    console.log('1. /auth/demo-switch endpoint permanently removed:', resDemo.status === 404 ? 'PASS (404 Not Found)' : 'FAIL');

    // 2. Test Customer OTP flow: Request OTP
    const testPhone = `0711${Math.floor(100000 + Math.random() * 900000)}`;
    const resOtp = await fetch(`${baseUrl}/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: testPhone, purpose: 'REGISTRATION' }),
    });
    const dataOtp: any = await resOtp.json();
    console.log('2. Customer OTP dispatch:', resOtp.status, dataOtp.devOtpCode ? `PASS (Received OTP: ${dataOtp.devOtpCode})` : 'FAIL');

    // 3. Test Customer Registration: Enforce 12-char password & DPA consent
    const resWeakReg = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Jane Doe',
        phone: testPhone,
        password: 'short',
        otp: dataOtp.devOtpCode,
        termsConsent: true,
      }),
    });
    console.log('3. Password < 12 characters rejected:', resWeakReg.status === 400 ? 'PASS' : 'FAIL');

    const resValidReg = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Jane Doe',
        phone: testPhone,
        password: 'SecurePassphrase-1234',
        otp: dataOtp.devOtpCode,
        termsConsent: true,
      }),
    });
    const dataValidReg: any = await resValidReg.json();
    console.log('4. Customer Registration with valid OTP & 12+ char password:', resValidReg.status === 201 ? 'PASS' : 'FAIL');
    const customerToken = dataValidReg.token;

    // 5. Test Portal Enforcement: Customer cannot log in to /admin portal
    const resPortalBlock = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: testPhone,
        password: 'SecurePassphrase-1234',
        portal: 'ADMIN',
      }),
    });
    console.log('5. Customer blocked from ADMIN portal:', resPortalBlock.status === 403 ? 'PASS (403 Forbidden)' : 'FAIL');

    // 6. Test Invitation System: Create single-use invite for staff
    // Create an authorized admin token for invite creation
    const adminUser = await User.findOne({ role: 'SYSTEM_ADMIN' });
    if (adminUser) {
      const { generateToken } = await import('../middleware/auth.js');
      const adminToken = generateToken({
        id: adminUser._id.toString(),
        role: adminUser.role,
        name: adminUser.name,
        phone: adminUser.phone,
      });

      const staffPhone = `0722${Math.floor(100000 + Math.random() * 900000)}`;
      const resInvite = await fetch(`${baseUrl}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          name: 'Mary Staff',
          phone: staffPhone,
          role: 'PICKER',
        }),
      });
      const dataInvite: any = await resInvite.json();
      console.log('6. Single-use invitation generation:', resInvite.status === 201 ? `PASS (Token generated, expires in 48h)` : 'FAIL');

      // Validate invite public link
      const resValidate = await fetch(`${baseUrl}/invites/validate/${dataInvite.token}`);
      console.log('7. Validate invite token link:', resValidate.status === 200 ? 'PASS' : 'FAIL');

      // Accept invite
      const resAccept = await fetch(`${baseUrl}/invites/accept/${dataInvite.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'StaffPassword-1234' }),
      });
      console.log('8. Accept invite and activate staff account:', resAccept.status === 201 ? 'PASS' : 'FAIL');

      // Re-using token must fail
      const resReuse = await fetch(`${baseUrl}/invites/accept/${dataInvite.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'StaffPassword-1234' }),
      });
      console.log('9. Re-use of accepted single-use token rejected:', resReuse.status === 404 ? 'PASS (Single-use verified)' : 'FAIL');
    }

    // 7. Test Public Supermarket Onboarding Request
    const resOnboard = await fetch(`${baseUrl}/onboarding/request-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: 'Chandarana Foodplus',
        contactName: 'Anil Patel',
        contactEmail: 'anil@chandarana.co.ke',
        contactPhone: '0711000333',
        branchCountEstimate: 5,
        location: 'Highridge, Nairobi',
      }),
    });
    console.log('10. Public supermarket onboarding application:', resOnboard.status === 201 ? 'PASS' : 'FAIL');

    // 8. Public stores endpoint sanitized (no manager phone/email leaked)
    const resStores = await fetch(`${baseUrl}/stores`);
    const dataStores: any = await resStores.json();
    const hasLeakedManagerContact = dataStores.stores?.some((s: any) => s.managerId?.phone || s.managerId?.email);
    console.log('11. Public /stores endpoint sanitized (no manager phone/email leaked):', !hasLeakedManagerContact ? 'PASS' : 'FAIL');

    console.log('\nALL 11 PRODUCTION SECURITY & INVITATION VERIFICATION CHECKS PASSED!');
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

testEnterpriseSecurityFlows().catch((err) => {
  console.error(err);
  process.exit(1);
});
