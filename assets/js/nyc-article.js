document.querySelectorAll('.reveal').forEach((element) => {
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      element.classList.add('is-visible');
      observer.unobserve(element);
    }
  }, { threshold: 0.14 });
  observer.observe(element);
});
