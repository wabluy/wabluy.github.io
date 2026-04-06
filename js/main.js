document.addEventListener('DOMContentLoaded', () => {
  fetch('data/publications.json')
    .then(res => res.json())
    .then(data => {
      const papers = data.sort((a, b) => b.year - a.year || b.citations - a.citations);
      renderPublications(papers);
    });

  function boldAuthor(authors) {
    return authors.replace(/Y Wang\*/g, '<strong>Yuxin Wang*</strong>')
                  .replace(/Y Wang(?!\*)/g, '<strong>Yuxin Wang</strong>');
  }

  function renderPublications(papers) {
    const container = document.getElementById('pub-list');
    container.innerHTML = '';

    papers.forEach((paper, idx) => {
      const entry = document.createElement('div');
      entry.className = 'pub-entry';

      const link = paper.links.pdf || paper.links.code || paper.links.project || '';
      const titleHtml = link
        ? `<a href="${link}" target="_blank" rel="noopener">${paper.title}</a>`
        : paper.title;

      const citHtml = paper.citations > 0
        ? `<span class="citation-badge${paper.citations >= 100 ? ' high' : ''}">${paper.citations} citations</span>`
        : '';

      const awardHtml = paper.award
        ? `<span class="award-badge">${paper.award}</span>`
        : '';

      let linksHtml = '';
      if (paper.links.pdf) {
        linksHtml += `<a class="pub-link" href="${paper.links.pdf}" target="_blank" rel="noopener">paper</a>`;
      }
      if (paper.links.code) {
        linksHtml += `<a class="pub-link" href="${paper.links.code}" target="_blank" rel="noopener">code</a>`;
      }

      entry.innerHTML = `
        <div>
          <span class="pub-number">${idx + 1}.</span>
          <span class="pub-title-text">${titleHtml}</span>
          ${awardHtml}${citHtml}
        </div>
        <div class="pub-authors">${boldAuthor(paper.authors)}</div>
        <div class="pub-venue-line">In <em>${paper.venue}</em>, ${paper.year}.</div>
        ${linksHtml ? `<div class="pub-links">${linksHtml}</div>` : ''}
      `;

      container.appendChild(entry);
    });
  }
});
