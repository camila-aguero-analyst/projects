(async () => {
  const container = document.querySelector('[data-borough-map]');
  if (!container || !window.d3) return;

  const BOROUGH_NAME_MAP = {
    Bronx: 'Bronx',
    'The Bronx': 'Bronx',
    Brooklyn: 'Brooklyn',
    Manhattan: 'Manhattan',
    Queens: 'Queens',
    'Staten Island': 'Staten Island',
  };
  const requiredBoroughs = ['Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'Staten Island'];
  const numberFields = [
    'total_renter_households',
    'rent_burdened_households',
    'severely_rent_burdened_households',
    'rent_burden_rate',
    'severe_rent_burden_rate',
  ];
  const formatCount = d3.format(',');
  const formatRate = (value) => `${d3.format('.1f')(value)}%`;

  try {
    const [rows, boundaries] = await Promise.all([
      d3.csv('assets/data/borough-rent-burden.csv', (row) => {
        const parsed = { borough: BOROUGH_NAME_MAP[row.borough] || row.borough };
        numberFields.forEach((field) => { parsed[field] = Number(row[field]); });
        return parsed;
      }),
      d3.json('assets/data/borough-boundaries.geojson'),
    ]);

    const dataByBorough = new Map(rows.map((row) => [row.borough, row]));
    const featureNames = boundaries.features.map((feature) => BOROUGH_NAME_MAP[feature.properties.boroname] || feature.properties.boroname);
    const missingData = requiredBoroughs.filter((borough) => !dataByBorough.has(borough));
    const missingFeatures = requiredBoroughs.filter((borough) => !featureNames.includes(borough));
    if (missingData.length || missingFeatures.length) throw new Error('Borough names could not be matched.');

    const width = 920;
    const height = 620;
    const color = d3.scaleSequential([45, 58], d3.interpolateRgb('#d9ecee', '#124c71'));
    const projection = d3.geoMercator().fitSize([width, height], boundaries);
    const path = d3.geoPath(projection);
    const tooltip = d3.select(document.body).append('div').attr('class', 'borough-tooltip').attr('role', 'status').attr('aria-live', 'polite');

    container.replaceChildren();
    const svg = d3.select(container).append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img')
      .attr('aria-label', 'New York City borough map colored by rent burden rate');

    const defs = svg.append('defs');
    const gradient = defs.append('linearGradient').attr('id', 'rent-burden-gradient').attr('x1', '0%').attr('x2', '100%');
    d3.range(0, 1.01, 0.1).forEach((stop) => gradient.append('stop').attr('offset', `${stop * 100}%`).attr('stop-color', color(45 + stop * 13)));

    const moveTooltip = (event) => {
      const margin = 12;
      const rect = tooltip.node().getBoundingClientRect();
      const pointerX = Number.isFinite(event.clientX) ? event.clientX : window.innerWidth / 2;
      const pointerY = Number.isFinite(event.clientY) ? event.clientY : window.innerHeight / 2;
      const x = Math.min(pointerX + margin, window.innerWidth - rect.width - margin);
      const y = Math.min(pointerY + margin, window.innerHeight - rect.height - margin);
      tooltip.style('left', `${Math.max(margin, x)}px`).style('top', `${Math.max(margin, y)}px`);
    };
    const showTooltip = (event, datum) => {
      tooltip.html(`<strong>${datum.borough}</strong><span>Rent burden rate: ${formatRate(datum.rent_burden_rate)}</span><span>Severe rent burden rate: ${formatRate(datum.severe_rent_burden_rate)}</span><span>Renter households: ${formatCount(datum.total_renter_households)}</span><span>Rent-burdened households: ${formatCount(datum.rent_burdened_households)}</span><span>Severely rent-burdened households: ${formatCount(datum.severely_rent_burdened_households)}</span>`)
        .classed('is-visible', true);
      moveTooltip(event);
    };
    const hideTooltip = () => tooltip.classed('is-visible', false);

    svg.append('g').attr('class', 'borough-shapes').selectAll('path')
      .data(boundaries.features)
      .join('path')
      .attr('d', path)
      .attr('tabindex', 0)
      .attr('aria-label', (feature) => {
        const datum = dataByBorough.get(BOROUGH_NAME_MAP[feature.properties.boroname] || feature.properties.boroname);
        return `${datum.borough}: rent burden rate ${formatRate(datum.rent_burden_rate)}`;
      })
      .attr('fill', (feature) => color(dataByBorough.get(BOROUGH_NAME_MAP[feature.properties.boroname] || feature.properties.boroname).rent_burden_rate))
      .on('pointerenter', function(event, feature) {
        d3.select(this).classed('is-active', true).raise();
        showTooltip(event, dataByBorough.get(BOROUGH_NAME_MAP[feature.properties.boroname] || feature.properties.boroname));
      })
      .on('pointermove', (event) => moveTooltip(event))
      .on('pointerleave', function() { d3.select(this).classed('is-active', false); hideTooltip(); })
      .on('focus', function(event, feature) { d3.select(this).classed('is-active', true).raise(); showTooltip(event, dataByBorough.get(BOROUGH_NAME_MAP[feature.properties.boroname] || feature.properties.boroname)); })
      .on('blur', function() { d3.select(this).classed('is-active', false); hideTooltip(); })
      .on('click', function(event, feature) {
        const datum = dataByBorough.get(BOROUGH_NAME_MAP[feature.properties.boroname] || feature.properties.boroname);
        const alreadyActive = d3.select(this).classed('is-selected');
        svg.selectAll('.borough-shapes path').classed('is-selected', false);
        if (alreadyActive) return hideTooltip();
        d3.select(this).classed('is-selected', true).raise();
        showTooltip(event, datum);
      });

    svg.append('g').attr('class', 'borough-labels').selectAll('text')
      .data(boundaries.features)
      .join('text')
      .attr('x', (feature) => path.centroid(feature)[0])
      .attr('y', (feature) => path.centroid(feature)[1])
      .text((feature) => BOROUGH_NAME_MAP[feature.properties.boroname] || feature.properties.boroname);

    const legend = svg.append('g').attr('class', 'map-legend').attr('transform', 'translate(34, 48)');
    legend.append('text').text('Rent Burden Rate');
    legend.append('rect').attr('y', 12).attr('width', 190).attr('height', 13).attr('fill', 'url(#rent-burden-gradient)');
    legend.append('text').attr('y', 43).text('45%');
    legend.append('text').attr('x', 190).attr('y', 43).attr('text-anchor', 'end').text('58%');
  } catch (error) {
    container.innerHTML = '<p class="map-error">The borough map could not be loaded.</p>';
    console.error(error);
  }
})();
