(() => {
  const chinese = {
    name: '王宇新',
    role: 'AI基础设施与其自进化',
    affiliation: '面壁智能',
    skip: '跳转到正文',
    homeLabel: '王宇新，返回顶部',
    navigation: '主导航',
    navAbout: '关于我',
    navProjects: '项目',
    navPublications: '论文',
    navPapers: '论文',
    navUpdates: '动态',
    profile: '个人资料',
    location: '中国北京',
    locationLabel: '位置',
    email: '邮箱',
    scholar: '谷歌学术',
    catLabel: '查看 Dr. Bo',
    catAlt: '我的猫 Dr. Bo',
    aboutLabel: '个人简介',
    moreBackground: '过往经历',
    projectsHeading: '开源项目',
    publicationsHeading: '近期论文',
    updatesHeading: '动态',
    backTop: '返回顶部',
    intro: '我目前在<a href="https://www.modelbest.cn/en/" target="_blank" rel="noopener">面壁智能</a>担任<span class="zh-unit">分布式</span>系统<span class="zh-unit">专家</span>，负责<span class="zh-unit">AI基础</span><span class="zh-unit">设施</span>的架构<span class="zh-unit">设计</span>与<span class="zh-unit">建设</span>，打造高效、可靠且<span class="zh-unit">具备</span><span class="zh-unit">可观测性</span>的系统。同时探索如何让系统<span class="zh-unit">持续</span><span class="zh-unit">自我改进。</span>',
    background: '此前，我在<a href="https://www.huawei.com/en/corporate-information/research-development" target="_blank" rel="noopener">HKRC</a>担任研究员，专注于超大规模系统的可靠性、自演进<span class="zh-unit">AI基础</span><span class="zh-unit">设施</span>，以及面向<span class="zh-unit">编程</span><span class="zh-unit">智能体</span>的<span class="zh-unit">软件</span><span class="zh-unit">设计</span>。我获得了<a href="https://www.hkbu.edu.hk/" target="_blank" rel="noopener">香港浸会<span class="zh-unit">大学</span>（HKBU）</a>的<span class="zh-unit">计算机</span><span class="zh-unit">科学</span><span class="zh-unit">博士</span>学位，导师为<a href="https://sites.google.com/view/chuxiaowen" target="_blank" rel="noopener"><span class="zh-unit">褚晓文</span><span class="zh-unit">教授</span></a>和<a href="https://amelieczhou.github.io/" target="_blank" rel="noopener"><span class="zh-unit">周池</span><span class="zh-unit">博士</span></a>。我也曾在<a href="https://www.nus.edu.sg/" target="_blank" rel="noopener">新加坡国立<span class="zh-unit">大学</span>（NUS）</a>访学，师从<a href="https://scholar.google.com/citations?user=RogYLKYAAAAJ&amp;hl=en" target="_blank" rel="noopener"><span class="zh-unit">何丙胜</span><span class="zh-unit">教授</span></a>。<span class="zh-unit">本科</span>毕业于<a href="https://www.hust.edu.cn/" target="_blank" rel="noopener">华中科技<span class="zh-unit">大学</span>（HUST）</a>，获得电气工程<span class="zh-unit">学士学位。</span>'
  };
  const richTextKeys = new Set(['intro', 'background']);
  const textEntries = [...document.querySelectorAll('[data-i18n]')].map(element => {
    const key = element.dataset.i18n;
    const property = richTextKeys.has(key) ? 'innerHTML' : 'textContent';
    return { element, key, property, english: element[property] };
  });
  const attributeEntries = ['aria-label', 'title', 'alt'].flatMap(attribute =>
    [...document.querySelectorAll(`[data-i18n-${attribute}]`)].map(element => ({
      element, attribute, key: element.getAttribute(`data-i18n-${attribute}`),
      english: element.getAttribute(attribute)
    }))
  );
  const languageButton = document.getElementById('language-toggle');
  const englishTitle = document.title;
  const description = document.querySelector('meta[name="description"]');
  const englishDescription = description.content;

  function setLanguage(language) {
    const isChinese = language === 'zh';
    document.documentElement.lang = isChinese ? 'zh-CN' : 'en';
    for (const entry of textEntries) {
      // Only the two authored biography translations contain HTML, preserving their links.
      entry.element[entry.property] = isChinese ? chinese[entry.key] : entry.english;
    }
    for (const entry of attributeEntries) {
      entry.element.setAttribute(entry.attribute, isChinese ? chinese[entry.key] : entry.english);
    }
    document.title = isChinese ? '王宇新 — AI基础设施与其自进化' : englishTitle;
    description.content = isChinese
      ? '王宇新目前在面壁智能担任分布式系统专家，专注于AI基础设施与其自进化。'
      : englishDescription;
    languageButton.textContent = isChinese ? 'EN' : '中';
    languageButton.lang = isChinese ? 'en' : 'zh-CN';
    const label = isChinese ? '切换到英文' : 'Switch to Chinese';
    languageButton.setAttribute('aria-label', label);
    languageButton.title = label;
    document.dispatchEvent(new Event('languagechange'));
  }

  let initialLanguage = 'en';
  try { if (localStorage.getItem('language') === 'zh') initialLanguage = 'zh'; } catch {}
  setLanguage(initialLanguage);
  languageButton.addEventListener('click', () => {
    const next = document.documentElement.lang === 'en' ? 'zh' : 'en';
    setLanguage(next);
    try { localStorage.setItem('language', next); } catch {}
  });
})();
