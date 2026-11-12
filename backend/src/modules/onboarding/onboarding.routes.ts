import { Router, Request, Response } from 'express';
import OnboardingApplication from './onboarding.model.js';
import AuditLog from '../audits/audit.model.js';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth.js';

const router = Router();

// Public: Submit Supermarket Onboarding Request
router.post('/request-access', async (req: Request, res: Response) => {
  try {
    const { companyName, contactName, contactEmail, contactPhone, branchCountEstimate, location, notes } = req.body;
    if (!companyName || !contactName || !contactEmail || !contactPhone || !location) {
      res.status(400).json({ success: false, error: 'Company name, contact name, email, phone, and location are required.' });
      return;
    }

    const application = await OnboardingApplication.create({
      companyName: companyName.trim(),
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim().toLowerCase(),
      contactPhone: contactPhone.trim(),
      branchCountEstimate: Number(branchCountEstimate) || 1,
      location: location.trim(),
      notes: notes ? notes.trim() : undefined,
      status: 'PENDING',
    });

    res.status(201).json({
      success: true,
      message: 'Onboarding application submitted successfully. Our team will review and contact you with access details.',
      applicationId: application._id,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Platform Super-Admin: List Onboarding Applications
router.get('/applications', authenticate, authorize('SYSTEM_ADMIN', 'PLATFORM_OWNER', 'PLATFORM_ADMIN'), async (_req: AuthRequest, res: Response) => {
  try {
    const applications = await OnboardingApplication.find().sort({ createdAt: -1 });
    res.json({ success: true, applications });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Platform Super-Admin: Review (Approve/Reject)
router.patch('/applications/:id/review', authenticate, authorize('SYSTEM_ADMIN', 'PLATFORM_OWNER', 'PLATFORM_ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { status, rejectionReason } = req.body;
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      res.status(400).json({ success: false, error: 'Status must be APPROVED or REJECTED.' });
      return;
    }

    const app = await OnboardingApplication.findById(req.params.id);
    if (!app) {
      res.status(404).json({ success: false, error: 'Application not found.' });
      return;
    }

    app.status = status;
    app.reviewedBy = req.user?.id as any;
    app.reviewedAt = new Date();
    if (rejectionReason) app.rejectionReason = rejectionReason;
    await app.save();

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'REVIEW_ONBOARDING_APPLICATION',
      entityType: 'ORGANIZATION',
      entityId: app._id.toString(),
      newValue: { status, companyName: app.companyName },
      reason: `Application marked as ${status}`,
    });

    res.json({ success: true, message: `Application ${status.toLowerCase()} successfully.`, application: app });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
