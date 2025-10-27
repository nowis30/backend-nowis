import { prisma } from '../../server/lib/prisma';

function ensureArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

export async function purgeUsersByIds(userIds: number | number[]): Promise<void> {
  const ids = ensureArray(userIds);
  if (ids.length === 0) {
    return;
  }

  await prisma.invoiceItem.deleteMany({ where: { invoice: { property: { userId: { in: ids } } } } });
  await prisma.invoice.deleteMany({ where: { property: { userId: { in: ids } } } });
  await prisma.expense.deleteMany({ where: { property: { userId: { in: ids } } } });
  await prisma.revenue.deleteMany({ where: { property: { userId: { in: ids } } } });
  await prisma.mortgage.deleteMany({ where: { property: { userId: { in: ids } } } });
  await prisma.propertyUnit.deleteMany({ where: { property: { userId: { in: ids } } } });
  await prisma.attachment.deleteMany({ where: { property: { userId: { in: ids } } } });
  await prisma.depreciationSetting.deleteMany({ where: { property: { userId: { in: ids } } } });
  await prisma.rentalTaxStatement.deleteMany({ where: { property: { userId: { in: ids } } } });
  await prisma.property.deleteMany({ where: { userId: { in: ids } } });

  await prisma.investmentTransaction.deleteMany({ where: { account: { userId: { in: ids } } } });
  await prisma.investmentHolding.deleteMany({ where: { account: { userId: { in: ids } } } });
  await prisma.investmentAccount.deleteMany({ where: { userId: { in: ids } } });

  await prisma.financialGoalProgress.deleteMany({ where: { goal: { userId: { in: ids } } } });
  await prisma.financialGoal.deleteMany({ where: { userId: { in: ids } } });

  await prisma.personalIncome.deleteMany({ where: { shareholder: { userId: { in: ids } } } });
  await prisma.personalAsset.deleteMany({ where: { userId: { in: ids } } });
  await prisma.personalLiability.deleteMany({ where: { userId: { in: ids } } });
  await prisma.personalExpense.deleteMany({ where: { userId: { in: ids } } });

  await prisma.freezeSimulationDividend.deleteMany({ where: { simulation: { userId: { in: ids } } } });
  await prisma.freezeSimulationRedemption.deleteMany({ where: { simulation: { userId: { in: ids } } } });
  await prisma.freezeSimulationBeneficiaryResult.deleteMany({ where: { simulation: { userId: { in: ids } } } });
  await prisma.freezeSimulationResult.deleteMany({ where: { simulation: { userId: { in: ids } } } });
  await prisma.freezeSimulation.deleteMany({ where: { userId: { in: ids } } });
  await prisma.freezeScenarioAsset.deleteMany({ where: { scenario: { userId: { in: ids } } } });
  await prisma.freezeScenario.deleteMany({ where: { userId: { in: ids } } });
  await prisma.freezeAsset.deleteMany({ where: { userId: { in: ids } } });

  await prisma.familyTrustFiduciary.deleteMany({ where: { trust: { userId: { in: ids } } } });
  await prisma.familyTrustBeneficiary.deleteMany({ where: { trust: { userId: { in: ids } } } });
  await prisma.familyTrust.deleteMany({ where: { userId: { in: ids } } });

  await prisma.familyWealthScenario.deleteMany({ where: { userId: { in: ids } } });
  await prisma.familyWealthSnapshot.deleteMany({ where: { userId: { in: ids } } });

  await prisma.dividendDeclaration.deleteMany({ where: { company: { userId: { in: ids } } } });
  await prisma.returnOfCapitalRecord.deleteMany({ where: { company: { userId: { in: ids } } } });
  await prisma.shareholderLoanPayment.deleteMany({ where: { loan: { company: { userId: { in: ids } } } } });
  await prisma.shareholderLoan.deleteMany({ where: { company: { userId: { in: ids } } } });
  await prisma.corporateTaxReturn.deleteMany({ where: { company: { userId: { in: ids } } } });
  await prisma.leveragedBuybackScenario.deleteMany({ where: { company: { userId: { in: ids } } } });
  await prisma.valuationSnapshot.deleteMany({ where: { company: { userId: { in: ids } } } });

  await prisma.shareTransaction.deleteMany({ where: { company: { userId: { in: ids } } } });
  await prisma.corporateStatementLine.deleteMany({ where: { statement: { company: { userId: { in: ids } } } } });
  await prisma.corporateStatement.deleteMany({ where: { company: { userId: { in: ids } } } });
  await prisma.corporateResolution.deleteMany({ where: { company: { userId: { in: ids } } } });
  await prisma.companyShareholder.deleteMany({ where: { company: { userId: { in: ids } } } });
  await prisma.shareClass.deleteMany({ where: { company: { userId: { in: ids } } } });
  await prisma.company.deleteMany({ where: { userId: { in: ids } } });

  await prisma.shareholder.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });

  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

export async function purgeUsersByEmails(emails: string | string[]): Promise<void> {
  const emailList = ensureArray(emails);
  if (emailList.length === 0) {
    return;
  }

  const users = await prisma.user.findMany({ where: { email: { in: emailList } }, select: { id: true } });
  if (users.length === 0) {
    return;
  }

  await purgeUsersByIds(users.map((user) => user.id));
}
