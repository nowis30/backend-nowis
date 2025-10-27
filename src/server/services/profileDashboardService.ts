import { buildFamilyWealthHistory, buildFamilyWealthOverview } from './wealth/familyWealthService';
import { getProfileSummary, type ProfileSummary } from './profileSummaryService';
import { deriveProfileInsights, type ProfileInsight } from './profileInsightsService';
import { buildProfileProjection, type ProfileProjection } from './profileProjectionService';

export interface ProfileDashboardPayload {
  generatedAt: string;
  summary: ProfileSummary;
  insights: ProfileInsight[];
  wealth: {
    overview: Awaited<ReturnType<typeof buildFamilyWealthOverview>>;
    history: Awaited<ReturnType<typeof buildFamilyWealthHistory>>;
  };
  projection: ProfileProjection;
}

export async function getProfileDashboard(userId: number): Promise<ProfileDashboardPayload> {
  const summary = await getProfileSummary(userId);
  const insights = deriveProfileInsights(summary);

  const [overview, history] = await Promise.all([
    buildFamilyWealthOverview(userId, { persistSnapshot: false }),
    buildFamilyWealthHistory(userId)
  ]);

  const latestHistory = history.slice(-12);
  const projection = await buildProfileProjection(userId, {
    summary,
    wealthHistory: history,
    wealthOverview: overview
  });

  return {
    generatedAt: new Date().toISOString(),
    summary,
    insights,
    wealth: {
      overview,
      history: latestHistory
    },
    projection
  };
}
