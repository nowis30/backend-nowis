import { prisma } from '../../lib/prisma';
import type { AdvisorExpertId } from './types';
import type { ConvoSnapshot, ConvoStep } from './convoEngine';

type PrismaTransactionClient = Parameters<typeof prisma.$transaction>[0] extends (infer Callback)
  ? Callback extends (client: infer Client) => unknown
    ? Client
    : never
  : never;

type DbExpert = 'FISCALISTE' | 'COMPTABLE' | 'PLANIFICATEUR' | 'AVOCAT';
type DbStatus = 'ACTIVE' | 'COMPLETED';
type DbRole = 'USER' | 'ASSISTANT';

type ConversationRow = {
  id: number;
  userId: number;
  expert: DbExpert;
  status: DbStatus;
  createdAt: Date;
  updatedAt: Date;
};

type ConversationWithStepsRow = ConversationRow & {
  steps: Array<ConversationStepRow>;
};

type ConversationStepRow = {
  id: number;
  conversationId: number;
  role: DbRole;
  message: string;
  snapshot?: unknown;
  updates?: unknown;
  nextQuestion?: unknown;
  completed?: boolean | null;
  createdAt: Date;
};

const EXPERT_TO_DB: Record<AdvisorExpertId, DbExpert> = {
  fiscaliste: 'FISCALISTE',
  comptable: 'COMPTABLE',
  planificateur: 'PLANIFICATEUR',
  avocat: 'AVOCAT'
};

const DB_TO_EXPERT: Record<DbExpert, AdvisorExpertId> = {
  FISCALISTE: 'fiscaliste',
  COMPTABLE: 'comptable',
  PLANIFICATEUR: 'planificateur',
  AVOCAT: 'avocat'
};

const ROLE_DB_TO_APP: Record<DbRole, 'user' | 'assistant'> = {
  USER: 'user',
  ASSISTANT: 'assistant'
};

interface PersistExchangeParams {
  userId: number;
  expertId: AdvisorExpertId;
  message: string;
  snapshot?: ConvoSnapshot;
  response: ConvoStep;
  conversationId?: number;
}

interface PersistExchangeResult {
  conversationId: number;
  status: DbStatus;
}

export type ConversationStatus = 'active' | 'completed';

function mapDbStatusToApp(status: DbStatus): ConversationStatus {
  return status === 'COMPLETED' ? 'completed' : 'active';
}

function mapAppStatusToDb(status: ConversationStatus): DbStatus {
  return status === 'completed' ? 'COMPLETED' : 'ACTIVE';
}

function getConversationDelegate(client: PrismaTransactionClient | typeof prisma) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any).advisorConversation;
}

function getConversationStepDelegate(client: PrismaTransactionClient | typeof prisma) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any).advisorConversationStep;
}

function hasSnapshotContent(snapshot?: ConvoSnapshot): boolean {
  if (!snapshot) {
    return false;
  }
  const propertiesCount = Array.isArray(snapshot.properties) ? snapshot.properties.length : 0;
  const personalIncomeCount = Array.isArray(snapshot.personalIncomes) ? snapshot.personalIncomes.length : 0;
  return propertiesCount > 0 || personalIncomeCount > 0;
}

async function fetchOrCreateConversation(
  tx: PrismaTransactionClient,
  params: { userId: number; expertId: AdvisorExpertId; conversationId?: number }
): Promise<ConversationRow> {
  const { userId, expertId, conversationId } = params;
  const expert = EXPERT_TO_DB[expertId];
  const conversationDelegate = getConversationDelegate(tx);

  if (conversationId) {
    const existing = (await conversationDelegate.findFirst({
      where: { id: conversationId, userId }
    })) as ConversationRow | null;

    if (!existing) {
      throw new Error('Conversation introuvable.');
    }
    if (existing.expert !== expert) {
      throw new Error('La conversation ne correspond pas au spécialiste demandé.');
    }
    return existing;
  }

  return conversationDelegate.create({
    data: {
      userId,
      expert,
      status: 'ACTIVE' satisfies DbStatus
    }
  }) as ConversationRow;
}

export async function persistConversationExchange(
  params: PersistExchangeParams
): Promise<PersistExchangeResult> {
  const { userId, expertId, message, snapshot, response, conversationId } = params;

  return prisma.$transaction(async (tx) => {
    const conversation = await fetchOrCreateConversation(tx, { userId, expertId, conversationId });

    const stepDelegate = getConversationStepDelegate(tx);

    await stepDelegate.create({
      data: {
        conversationId: conversation.id,
        role: 'USER' satisfies DbRole,
        message,
        snapshot: hasSnapshotContent(snapshot) ? snapshot : undefined
      }
    });

    await stepDelegate.create({
      data: {
        conversationId: conversation.id,
        role: 'ASSISTANT' satisfies DbRole,
        message: response.message,
        updates: response.updates.length ? response.updates : undefined,
        nextQuestion: response.nextQuestion ?? undefined,
        completed: response.completed
      }
    });

    const newStatus: DbStatus = response.completed ? 'COMPLETED' : 'ACTIVE';

    const conversationDelegate = getConversationDelegate(tx);
    const updatedConversation = (await conversationDelegate.update({
      where: { id: conversation.id },
      data: { status: newStatus }
    })) as ConversationRow;

    return {
      conversationId: updatedConversation.id,
      status: updatedConversation.status
    };
  });
}

export interface ConversationSummary {
  id: number;
  expertId: AdvisorExpertId;
  status: ConversationStatus;
  createdAt: Date;
  updatedAt: Date;
  lastMessage?: {
    role: 'user' | 'assistant';
    content: string;
    createdAt: Date;
  };
}

export async function listUserConversations(userId: number): Promise<ConversationSummary[]> {
  const conversationDelegate = getConversationDelegate(prisma);
  const conversations = (await conversationDelegate.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: {
      steps: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: { id: true, role: true, message: true, createdAt: true }
      }
    }
  })) as Array<ConversationRow & { steps: Array<{ role: DbRole; message: string; createdAt: Date }> }>;

  return conversations.map((conversation) => ({
    id: conversation.id,
    expertId: DB_TO_EXPERT[conversation.expert],
    status: mapDbStatusToApp(conversation.status),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    lastMessage: conversation.steps[0]
      ? {
          role: ROLE_DB_TO_APP[conversation.steps[0].role],
          content: conversation.steps[0].message,
          createdAt: conversation.steps[0].createdAt
        }
      : undefined
  }));
}

export interface ConversationDetailStep {
  id: number;
  role: 'user' | 'assistant';
  message: string;
  snapshot?: unknown;
  updates?: unknown;
  nextQuestion?: unknown;
  completed?: boolean | null;
  createdAt: Date;
}

export interface ConversationDetail {
  id: number;
  expertId: AdvisorExpertId;
  status: ConversationStatus;
  createdAt: Date;
  updatedAt: Date;
  steps: ConversationDetailStep[];
}

export async function loadConversationDetail(
  userId: number,
  conversationId: number
): Promise<ConversationDetail | null> {
  const conversationDelegate = getConversationDelegate(prisma);
  const conversation = (await conversationDelegate.findFirst({
    where: { id: conversationId, userId },
    include: {
      steps: {
        orderBy: { createdAt: 'asc' }
      }
    }
  })) as ConversationWithStepsRow | null;

  if (!conversation) {
    return null;
  }

  return {
    id: conversation.id,
    expertId: DB_TO_EXPERT[conversation.expert],
    status: mapDbStatusToApp(conversation.status),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    steps: conversation.steps.map((step) => ({
      id: step.id,
      role: ROLE_DB_TO_APP[step.role],
      message: step.message,
      snapshot: step.snapshot ?? undefined,
      updates: step.updates ?? undefined,
      nextQuestion: step.nextQuestion ?? undefined,
      completed: step.completed ?? undefined,
      createdAt: step.createdAt
    }))
  };
}

export async function updateConversationStatus(
  userId: number,
  conversationId: number,
  status: ConversationStatus
): Promise<ConversationSummary | null> {
  const conversationDelegate = getConversationDelegate(prisma);
  const existing = (await conversationDelegate.findFirst({
    where: { id: conversationId, userId },
    include: {
      steps: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: { id: true, role: true, message: true, createdAt: true }
      }
    }
  })) as (ConversationRow & {
    steps: Array<{ role: DbRole; message: string; createdAt: Date }>;
  }) | null;

  if (!existing) {
    return null;
  }

  const updated = (await conversationDelegate.update({
    where: { id: conversationId },
    data: { status: mapAppStatusToDb(status) }
  })) as ConversationRow;

  return {
    id: updated.id,
    expertId: DB_TO_EXPERT[updated.expert],
    status,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    lastMessage: existing.steps[0]
      ? {
          role: ROLE_DB_TO_APP[existing.steps[0].role],
          content: existing.steps[0].message,
          createdAt: existing.steps[0].createdAt
        }
      : undefined
  };
}
