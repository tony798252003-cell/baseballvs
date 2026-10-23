import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lineupName } from './playerName.js'

// 打序欄很窄：西洋名只留姓氏才放得下
test('Latin name shows surname only', () => {
  assert.equal(lineupName('Stuart Fairchild'), 'Fairchild')
})
// 去掉 Jr. 會讓小葛雷羅變成老葛雷羅，必須保留
test('trailing suffix stays attached to surname', () => {
  assert.equal(lineupName('Vladimir Guerrero Jr.'), 'Guerrero Jr.')
  assert.equal(lineupName('Ken Griffey III'), 'Griffey III')
})
// 單名者（如 Ichiro）無從縮短
test('single-token Latin name unchanged', () => {
  assert.equal(lineupName('Ichiro'), 'Ichiro')
})
// 中日文與原住民名（含全形間隔號）不是西洋名，不可截斷
test('CJK / katakana / indigenous names unchanged', () => {
  assert.equal(lineupName('山本由伸'), '山本由伸')
  assert.equal(lineupName('オースティン'), 'オースティン')
  assert.equal(lineupName('吉力吉撈．鞏冠'), '吉力吉撈．鞏冠')
})
