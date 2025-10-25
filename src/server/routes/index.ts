import { Router } from 'express';

import { authRouter } from './auth';
import { invoicesRouter } from './invoices';
import { propertiesRouter } from './properties';
import { summaryRouter } from './summary';
import { expensesRouter } from './expenses';
import { revenuesRouter } from './revenues';
import { companiesRouter } from './companies';
import { rolesRouter } from './roles';
import { userRolesRouter } from './userRoles';
import { usersRouter } from './users';
import { reportsRouter } from './reports';
import { dividendsRouter } from './dividends';
import { taxRouter } from './tax';

const routes = Router();

routes.use('/auth', authRouter);
routes.use('/properties', propertiesRouter);
routes.use('/invoices', invoicesRouter);
routes.use('/expenses', expensesRouter);
routes.use('/revenues', revenuesRouter);
routes.use('/summary', summaryRouter);
routes.use('/companies', companiesRouter);
routes.use('/roles', rolesRouter);
routes.use('/userRoles', userRolesRouter);
routes.use('/users', usersRouter);
routes.use('/reports', reportsRouter);
routes.use('/corporate', dividendsRouter);
routes.use('/tax', taxRouter);

export { routes };
