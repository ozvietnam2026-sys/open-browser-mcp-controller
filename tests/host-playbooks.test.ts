import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { HOST_PLAYBOOKS, playbookForHost, playbookCheatSheet } from '../shared/host-playbooks.js';

describe('host playbooks (obmc-host-playbooks-20261107)', () => {
  test('covers the five sourcing sites with canonical search URLs', () => {
    assert.equal(HOST_PLAYBOOKS.length, 5);
    assert.equal(
      playbookForHost('www.made-in-china.com')!.searchUrl('rtx 5000'),
      'https://www.made-in-china.com/productdirectory.do?word=rtx+5000&subaction=hunt'
    );
    assert.equal(
      playbookForHost('s.taobao.com')!.searchUrl('显卡'),
      'https://s.taobao.com/search?q=' + encodeURIComponent('显卡')
    );
    assert.equal(
      playbookForHost('1688.com')!.searchUrl('rtx pro'),
      'https://s.1688.com/selloffer/offer_search.htm?keywords=rtx+pro'
    );
    assert.match(playbookForHost('www.jd.com')!.searchUrl('rtx pro'), /keyword=rtx\+pro/);
    assert.match(playbookForHost('aliexpress.com')!.searchUrl('gpu'), /wholesale\?SearchText=/);
  });

  test('matches subdomains and www, returns undefined for unknown hosts', () => {
    assert.ok(playbookForHost('ordosync.en.made-in-china.com'));
    assert.ok(playbookForHost('world.taobao.com'));
    assert.equal(playbookForHost('example.com'), undefined);
    assert.equal(playbookForHost(''), undefined);
  });

  test('each playbook carries wall notes so the model classifies by the right site rules', () => {
    assert.match(playbookForHost('1688.com')!.notes, /unusual_traffic/i);
    assert.match(playbookForHost('taobao.com')!.notes, /login_wall/);
    assert.match(playbookForHost('jd.com')!.notes, /wrong_site_or_locale/);
    assert.match(playbookForHost('made-in-china.com')!.notes, /not available/i);
    assert.match(playbookForHost('aliexpress.com')!.notes, /fetch_error/i);
  });

  test('cheat sheet lists one URL shape per site for the prompt', () => {
    const sheet = playbookCheatSheet();
    assert.equal((sheet.match(/^- /gm) || []).length, HOST_PLAYBOOKS.length);
    assert.match(sheet, /taobao/);
    // TỪ_KHÓA được mã hóa URL trong các template (word=/q=/keywords=)
    assert.match(sheet, /T%E1%BB%AA_KH%C3%93A/);
  });
});
