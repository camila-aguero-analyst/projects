(() => {
	const sections = [...document.querySelectorAll('[data-section]')];
	const links = [...document.querySelectorAll('.story-nav a')];
	const revealItems = document.querySelectorAll('.reveal');
	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (reduceMotion || !('IntersectionObserver' in window)) { revealItems.forEach((item) => item.classList.add('is-visible')); return; }
	const revealObserver = new IntersectionObserver((entries, observer) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }), { threshold: 0.15 });
	revealItems.forEach((item) => revealObserver.observe(item));
	const sectionObserver = new IntersectionObserver((entries) => { const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]; if (!visible || !visible.target.id) return; links.forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === `#${visible.target.id}`)); }, { rootMargin: '-35% 0px -45%', threshold: [0.01, 0.2, 0.5] });
	sections.forEach((section) => sectionObserver.observe(section));
})();
