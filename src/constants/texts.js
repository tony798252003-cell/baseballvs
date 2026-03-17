// 統一管理所有文案
export const TEXTS = {
  // 模式選擇
  mode: {
    single: '單人模式',
    versus: '對戰模式',
  },
  
  // 球隊選擇
  team: {
    selectAway: '選擇客隊',
    selectHome: '選擇主隊',
    awayConfirmed: '客隊設定完成！請選擇主隊',
    backToAway: '返回客隊設定',
  },
  
  // 陣容相關
  lineup: {
    full: '打序已滿（最多9人）',
    needComplete: '請選擇完整的9位打者和1位投手',
    needPlayer: '請至少選擇一位球員',
    needPitcher: '請選擇對戰投手',
    awayIncomplete: '客隊陣容不完整',
    homeIncomplete: '主隊陣容不完整',
    replaced: (index, oldName, newName) => `已替換第${index + 1}棒：${oldName} → ${newName}`,
    replacePrompt: (index) => `請從左側選擇球員替換第${index + 1}棒`,
    randomSelected: '已隨機選擇球員！',
  },
  
  // 比賽相關
  game: {
    // 局數
    inning: (inning, isTop) => `${inning}局 ${isTop ? '上' : '下'}`,
    
    // 得分
    homeRun: (runs) => `全壘打！帶有 ${runs} 分打點！`,
    hit: (hitType, runs) => `${hitType}！${runs > 0 ? `得了 ${runs} 分！` : ''}`,
    runsScored: (runs) => `帶有${runs}分打點`,
    
    // 安打類型
    hitTypes: {
      single: '一安',
      double: '二安',
      triple: '三安',
    },
    
    // 語音播報用
    speech: {
      single: '一壘安打',
      double: '二壘安打',
      triple: '三壘安打',
      homeRun: '全壘打',
      hitWithRuns: (hitType, runs) => `打者打出${hitType}，帶有${runs}分打點`,
      hitNoRuns: (hitType) => `打者打出${hitType}`,
      walk: '打者選到保送',
      walkWithRuns: (runs) => `打者選到保送，帶有${runs}分打點`,
      hbp: '打者被觸身球',
      hbpWithRuns: (runs) => `打者被觸身球，帶有${runs}分打點`,
      strikeout: '打者三振出局',
      out: '打者出局',
      batterUp: (index, name) => `現在上場打擊的是 第${index + 1}棒 ${name}`,
      batterIntro: (index, number, name) => `第 ${index + 1} 棒、${number} 號、${name}`,
      substitute: (name) => `更換代打 ${name}`,
      pitcherChange: (name) => `場上更換投手 ${name}`,
    },
    
    // 保送
    walkLoaded: '滿壘保送擠回一分！',
    fourBalls: '四壞球保送！',
    
    // 觸身球
    hbp: '觸身球！',
    hbpLoaded: '滿壘觸身球擠回一分！',
    
    // 出局
    strikeout: '三振出局！',
    out: '出局！',
    threeOuts: '三人出局！清除壘包',
    threeOutsSwitch: (toHome) => `三人出局！攻守交換 - 換${toHome ? '主' : '客'}隊進攻`,
    
    // 比賽結束
    gameOver: (awayScore, homeScore) => `比賽結束！最終比分 客隊 ${awayScore} : ${homeScore} 主隊`,
    gameOverSingle: (score) => `比賽結束！最終得分 ${score} 分`,
    
    // 球數
    threeStrikes: '三振出局！',
  },
  
  // 球員替換
  substitution: {
    batter: (oldName, newName) => `${oldName} → ${newName} 代打`,
    pitcher: (oldName, newName) => `${oldName || '投手'} → ${newName} 換投`,
  },
  
  // 對話框標題
  dialog: {
    selectPitcher: '選擇對戰投手',
  },
  
  // 通知類型
  toast: {
    success: 'success',
    alert: 'alert',
    info: 'info',
  },
  
  // 其他
  misc: {
    otherTeam: '其他球隊',
  },
}
