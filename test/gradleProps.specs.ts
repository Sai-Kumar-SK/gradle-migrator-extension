import { expect } from 'chai';
import * as fs from 'fs-extra';
import * as path from 'path';
import { updateGradlePropertiesFiles } from '../src/migrator/gradleFiles';

describe('updateGradlePropertiesFiles', () => {
  const tmp = path.join(__dirname, 'tmp-test');
  const file = path.join(tmp, 'gradle.properties');

  beforeEach(async () => {
    await fs.remove(tmp);
    await fs.ensureDir(tmp);
  });

  it('replaces abc.org.com with efg.org.com but preserves paths and versions', async () => {
    const content = [
      'gradleRepositoryUrl=https://abc.org.com/gradle/gradle-7.6-all.zip',
      'someOther=1'
    ].join('\n');
    await fs.writeFile(file, content, 'utf8');

    const result = await updateGradlePropertiesFiles(tmp);
    expect(result.success).to.be.true;
    expect(result.filesProcessed).to.equal(1);
    expect(result.warnings.join(',')).to.include('gradle.properties');

    const updated = (await fs.readFile(file, 'utf8')).trim();
    expect(updated).to.contain('https://efg.org.com/gradle/gradle-7.6-all.zip');
    expect(updated).to.contain('someOther=1');
  });

  it('does nothing if domain not present', async () => {
    await fs.writeFile(file, 'gradleRepositoryUrl=https://other.com/gradle.zip', 'utf8');
    const result = await updateGradlePropertiesFiles(tmp);
    expect(result.filesProcessed).to.equal(0);
    const after = (await fs.readFile(file, 'utf8')).trim();
    expect(after).to.contain('other.com');
  });
});
