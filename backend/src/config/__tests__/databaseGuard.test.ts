import { databaseCredentialProblem, enforceDatabaseCredential } from '../databaseGuard';
import logger from '../../utils/logger';

describe('databaseCredentialProblem', () => {
  it('accepts a real password', () => {
    expect(databaseCredentialProblem('postgresql://crazyvtt:s3cr3t-and-long@database:5432/crazyvtt')).toBeNull();
  });

  it.each([
    'postgresql://crazyvtt:CHANGE_ME_TO_SECURE_PASSWORD@database:5432/crazyvtt',
    'postgresql://crazyvtt:CHANGE_ME@database:5432/crazyvtt',
    'postgresql://crazyvtt:CHANGE_ME_TO_SECURE_PASSWORD@localhost/crazyvtt?schema=public',
  ])('names the placeholder in %s', (url) => {
    expect(databaseCredentialProblem(url)).toMatch(/placeholder/);
  });

  it('names an unset or malformed URL', () => {
    expect(databaseCredentialProblem(undefined)).toMatch(/not set/);
    expect(databaseCredentialProblem('not a url')).toMatch(/not a valid/);
  });
});

describe('enforceDatabaseCredential', () => {
  const placeholder = 'postgresql://crazyvtt:CHANGE_ME_TO_SECURE_PASSWORD@database:5432/crazyvtt';

  it('exits in production on the placeholder', () => {
    const exit = jest.fn();
    enforceDatabaseCredential({ DATABASE_URL: placeholder, NODE_ENV: 'production' }, exit);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('only warns outside production', () => {
    const exit = jest.fn();
    enforceDatabaseCredential({ DATABASE_URL: placeholder, NODE_ENV: 'development' }, exit);
    expect(exit).not.toHaveBeenCalled();
  });

  it('prints commands for the user and database the URL names', () => {
    const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    enforceDatabaseCredential(
      { DATABASE_URL: 'postgresql://tabletop:CHANGE_ME@database:5432/games', NODE_ENV: 'production' },
      jest.fn()
    );
    const message = String(logged.mock.calls[0][0]);
    logged.mockRestore();
    expect(message).toContain(`docker compose exec database psql -U tabletop -d games -c "ALTER USER tabletop WITH PASSWORD '<new>';"`);
    expect(message).not.toContain('crazyvtt');
  });

  it('prints the default names for the shipped URL', () => {
    const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    enforceDatabaseCredential({ DATABASE_URL: placeholder, NODE_ENV: 'production' }, jest.fn());
    const message = String(logged.mock.calls[0][0]);
    logged.mockRestore();
    expect(message).toContain(`docker compose exec database psql -U crazyvtt -d crazyvtt -c "ALTER USER crazyvtt WITH PASSWORD '<new>';"`);
  });

  it('does nothing with a real password in production', () => {
    const exit = jest.fn();
    enforceDatabaseCredential({ DATABASE_URL: 'postgresql://u:real-password-here@db:5432/x', NODE_ENV: 'production' }, exit);
    expect(exit).not.toHaveBeenCalled();
  });
});
