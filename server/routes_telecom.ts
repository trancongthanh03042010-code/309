import { Router, type Request, type Response } from 'express';
import { db } from './db.ts';
import {
  getTelecomOverview,
  purchaseCatalogSim,
  purchaseSimPackage,
  setPrimarySim,
  TelecomHttpError,
  topupUserSim,
  updateUserSim,
} from './telecom_engine.ts';

function handleTelecomError(err: unknown, res: Response): void {
  if (err instanceof TelecomHttpError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err.extra || {}),
    });
    return;
  }
  res.status(500).json({
    error: err instanceof Error ? err.message : 'Lỗi hệ thống Anime Telecom',
    code: 'INTERNAL_ERROR',
  });
}

export function createTelecomRouter(): Router {
  const router = Router();

  router.get('/overview', (_req: Request, res: Response) => {
    try {
      res.json(getTelecomOverview());
    } catch (err) {
      handleTelecomError(err, res);
    }
  });

  router.get('/carriers/:id', (req: Request, res: Response) => {
    try {
      const overview = getTelecomOverview();
      const carrier = overview.carriers.find((c) => String(c.id) === req.params.id);
      if (!carrier) {
        res.status(404).json({ error: 'Không tìm thấy nhà mạng' });
        return;
      }
      res.json({
        carrier,
        catalog: overview.catalog.filter((s) => String(s.carrier_id) === req.params.id),
        packages: overview.packages.filter((p) => String(p.carrier_id) === req.params.id),
        userSims: overview.userSims.filter((s) => String(s.carrier_id) === req.params.id),
      });
    } catch (err) {
      handleTelecomError(err, res);
    }
  });

  router.post('/sims/buy', (req: Request, res: Response) => {
    try {
      const {
        catalogId = '',
        aliasName,
        setAsPrimary,
        sourceAccountId,
        sourceCardId,
        idempotencyKey,
      } = req.body as {
        catalogId?: string;
        aliasName?: string;
        setAsPrimary?: boolean;
        sourceAccountId?: string;
        sourceCardId?: string;
        idempotencyKey?: string;
      };
      const result = purchaseCatalogSim({
        catalogId,
        aliasName,
        setAsPrimary,
        sourceAccountId,
        sourceCardId,
        idempotencyKey,
      });
      res.json(result);
    } catch (err) {
      handleTelecomError(err, res);
    }
  });

  router.post('/sims/:id/primary', (req: Request, res: Response) => {
    try {
      res.json(setPrimarySim(req.params.id));
    } catch (err) {
      handleTelecomError(err, res);
    }
  });

  router.patch('/sims/:id', (req: Request, res: Response) => {
    try {
      const { aliasName, status } = req.body as {
        aliasName?: string;
        status?: 'active' | 'locked' | 'cancelled';
      };
      res.json(updateUserSim(req.params.id, { aliasName, status }));
    } catch (err) {
      handleTelecomError(err, res);
    }
  });

  router.post('/topup', (req: Request, res: Response) => {
    try {
      const {
        simId,
        phone,
        carrierId,
        amount = 100000,
        sourceAccountId,
        sourceCardId,
        idempotencyKey,
      } = req.body as {
        simId?: string;
        phone?: string;
        carrierId?: string;
        amount?: number;
        sourceAccountId?: string;
        sourceCardId?: string;
        idempotencyKey?: string;
      };
      const result = topupUserSim({
        simId,
        phone,
        carrierId,
        amount,
        sourceAccountId,
        sourceCardId,
        idempotencyKey,
        origin: 'telecom',
      });
      res.json(result);
    } catch (err) {
      handleTelecomError(err, res);
    }
  });

  router.post('/packages/buy', (req: Request, res: Response) => {
    try {
      const {
        simId = '',
        packageId = '',
        confirmReplace = false,
        idempotencyKey,
      } = req.body as {
        simId?: string;
        packageId?: string;
        confirmReplace?: boolean;
        idempotencyKey?: string;
      };
      const result = purchaseSimPackage({
        simId,
        packageId,
        confirmReplace,
        idempotencyKey,
      });
      res.json(result);
    } catch (err) {
      handleTelecomError(err, res);
    }
  });

  router.patch('/notifications/read-all', (_req: Request, res: Response) => {
    try {
      db.prepare('UPDATE telecom_notifications SET is_read = 1 WHERE is_read = 0').run();
      res.json(getTelecomOverview());
    } catch (err) {
      handleTelecomError(err, res);
    }
  });

  return router;
}
