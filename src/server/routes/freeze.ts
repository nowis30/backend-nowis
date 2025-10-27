import { Router } from 'express';
import { z } from 'zod';

import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';
import {
  createFreezeAsset,
  createFreezeScenario,
  createFreezeSimulation,
  deleteFreezeAsset,
  deleteFreezeScenario,
  getFreezeSimulation,
  listFamilyTrusts,
  listFreezeAssets,
  listFreezeScenarios,
  listFreezeShareholders,
  listFreezeSimulations,
  updateFreezeAsset,
  updateFreezeScenario
} from '../services/freezeService';
import {
  freezeAssetSchema,
  freezeScenarioSchema,
  freezeSimulationSchema
} from '../services/freezeSchemas';
import { buildSuccessionProgressReport } from '../services/successionProgressService';

const freezeRouter = Router();

const idParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

freezeRouter.use(authenticated);

freezeRouter.get(
  '/shareholders',
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const shareholders = await listFreezeShareholders(req.userId!);
      res.json(shareholders);
    } catch (error) {
      next(error);
    }
  }
);

freezeRouter.get(
  '/trusts',
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const trusts = await listFamilyTrusts(req.userId!);
      res.json(trusts);
    } catch (error) {
      next(error);
    }
  }
);

freezeRouter.get(
  '/assets',
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const assets = await listFreezeAssets(req.userId!);
      res.json(assets);
    } catch (error) {
      next(error);
    }
  }
);

freezeRouter.post(
  '/assets',
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const payload = freezeAssetSchema.parse(req.body);
      const asset = await createFreezeAsset(req.userId!, payload);
      res.status(201).json(asset);
    } catch (error) {
      next(error);
    }
  }
);

freezeRouter.put(
  '/assets/:id',
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const payload = freezeAssetSchema.parse(req.body);
      const asset = await updateFreezeAsset(req.userId!, id, payload);

      if (!asset) {
        return res.status(404).json({ error: "Actif de gel introuvable." });
      }

      res.json(asset);
    } catch (error) {
      next(error);
    }
  }
);

freezeRouter.delete(
  '/assets/:id',
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const deleted = await deleteFreezeAsset(req.userId!, id);

      if (!deleted) {
        return res.status(404).json({ error: "Actif de gel introuvable." });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

freezeRouter.get(
  '/scenarios',
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const scenarios = await listFreezeScenarios(req.userId!);
      res.json(scenarios);
    } catch (error) {
      next(error);
    }
  }
);

freezeRouter.post(
  '/scenarios',
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const payload = freezeScenarioSchema.parse(req.body);
      const scenario = await createFreezeScenario(req.userId!, payload);

      if (!scenario) {
        return res.status(400).json({ error: 'Impossible de créer le scénario de gel.' });
      }

      res.status(201).json(scenario);
    } catch (error) {
      next(error);
    }
  }
);

freezeRouter.put(
  '/scenarios/:id',
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const payload = freezeScenarioSchema.parse(req.body);
      const scenario = await updateFreezeScenario(req.userId!, id, payload);

      if (!scenario) {
        return res.status(404).json({ error: 'Scénario de gel introuvable.' });
      }

      res.json(scenario);
    } catch (error) {
      next(error);
    }
  }
);

freezeRouter.delete(
  '/scenarios/:id',
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const deleted = await deleteFreezeScenario(req.userId!, id);

      if (!deleted) {
        return res.status(404).json({ error: 'Scénario de gel introuvable.' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

freezeRouter.get(
  '/simulations',
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const simulations = await listFreezeSimulations(req.userId!);
      res.json(simulations);
    } catch (error) {
      next(error);
    }
  }
);

freezeRouter.get(
  '/simulations/:id',
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const simulation = await getFreezeSimulation(req.userId!, id);

      if (!simulation) {
        return res.status(404).json({ error: 'Simulation introuvable.' });
      }

      res.json(simulation);
    } catch (error) {
      next(error);
    }
  }
);

freezeRouter.post(
  '/simulations',
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const payload = freezeSimulationSchema.parse(req.body);
      const simulation = await createFreezeSimulation(req.userId!, payload);

      if (!simulation) {
        return res.status(400).json({ error: 'Impossible de créer la simulation.' });
      }

      res.status(201).json(simulation);
    } catch (error) {
      next(error);
    }
  }
);

freezeRouter.get(
  '/progress',
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const report = await buildSuccessionProgressReport(req.userId!);
      res.json(report);
    } catch (error) {
      next(error);
    }
  }
);

freezeRouter.get(
  '/bootstrap',
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const [shareholders, trusts, assets, scenarios, simulations] = await Promise.all([
        listFreezeShareholders(req.userId!),
        listFamilyTrusts(req.userId!),
        listFreezeAssets(req.userId!),
        listFreezeScenarios(req.userId!),
        listFreezeSimulations(req.userId!)
      ]);

      res.json({ shareholders, trusts, assets, scenarios, simulations });
    } catch (error) {
      next(error);
    }
  }
);

export { freezeRouter };
