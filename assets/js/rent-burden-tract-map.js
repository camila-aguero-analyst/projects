(async () => {
  const container = document.querySelector('[data-tract-map]');
  if (!container || !window.d3) return;

  const REQUIRED_FIELDS = [
    'total_renter_households',
    'rent_burdened_households',
    'severely_rent_burdened_households',
    'rent_burden_rate',
    'severe_rent_burden_rate',
  ];
  const formatCount = d3.format(',');
  const formatRate = (value) => `${d3.format('.1f')(value)}%`;
  const normalizeGeoid = (value) => {
    const match = String(value || '').match(/(\d{11})$/);
    return match ? match[1] : null;
  };
  const tractLabel = (name, geoid) => {
    const match = String(name || '').match(/Census Tract\s+([^;]+)/i);
    return match ? match[1] : geoid;
  };

  try {
    const [rows, tractBoundaries, boroughBoundaries] = await Promise.all([
      d3.csv('assets/data/tract-rent-burden.csv', (row) => {
        const parsed = {
          geoid: normalizeGeoid(row.geo_id),
          geography_name: row.geography_name,
          borough: row.borough,
        };
        REQUIRED_FIELDS.forEach((field) => { parsed[field] = Number(row[field]); });
        return parsed;
      }),
      d3.json('assets/data/census-tracts-2020.geojson'),
      d3.json('assets/data/borough-boundaries.geojson'),
    ]);

    const qualifyingRows = rows.filter((row) => (
      row.geoid
      && Number.isFinite(row.rent_burden_rate)
      && row.total_renter_households >= 400
    ));
    const dataByGeoid = new Map(qualifyingRows.map((row) => [row.geoid, row]));
    const analysisFeatures = tractBoundaries.features.filter((feature) => dataByGeoid.has(feature.properties.geoid));

    if (!analysisFeatures.length) throw new Error('No qualifying census tracts could be matched.');

    const width = 920;
    const height = 620;
    const color = d3.scaleSequential([0, 90], d3.interpolateRgb('#d9ecee', '#124c71'));
    const projection = d3.geoMercator().fitSize([width, height], tractBoundaries);
    const path = d3.geoPath(projection);
    const tooltip = d3.select(document.body).append('div').attr('class', 'tract-tooltip').attr('role', 'status').attr('aria-live', 'polite');

    container.replaceChildren();
    const svg = d3.select(container).append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img')
      .attr('aria-label', 'New York City census tracts colored by rent burden rate');

    const defs = svg.append('defs');
    const gradient = defs.append('linearGradient').attr('id', 'tract-rent-burden-gradient').attr('x1', '0%').attr('x2', '100%');
    d3.range(0, 1.01, 0.1).forEach((stop) => gradient.append('stop').attr('offset', `${stop * 100}%`).attr('stop-color', color(stop * 90)));

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
      tooltip.html(`<strong>Census Tract ${tractLabel(datum.geography_name, datum.geoid)}</strong><b>${datum.borough}</b><span>Rent burden rate: ${formatRate(datum.rent_burden_rate)}</span><span>Severe rent burden rate: ${formatRate(datum.severe_rent_burden_rate)}</span><span>Renter households: ${formatCount(datum.total_renter_households)}</span><span>Rent-burdened households: ${formatCount(datum.rent_burdened_households)}</span><span>Severely rent-burdened households: ${formatCount(datum.severely_rent_burdened_households)}</span>`)
        .classed('is-visible', true);
      moveTooltip(event);
    };
    const hideTooltip = () => tooltip.classed('is-visible', false);

    svg.append('g').attr('class', 'tract-shapes').selectAll('path')
      .data(analysisFeatures)
      .join('path')
      .attr('d', path)
      .attr('tabindex', 0)
      .attr('aria-label', (feature) => {
        const datum = dataByGeoid.get(feature.properties.geoid);
        return `Census Tract ${tractLabel(datum.geography_name, datum.geoid)}, ${datum.borough}: rent burden rate ${formatRate(datum.rent_burden_rate)}`;
      })
      .attr('fill', (feature) => color(dataByGeoid.get(feature.properties.geoid).rent_burden_rate))
      .on('pointerenter', function(event, feature) {
        d3.select(this).classed('is-active', true).raise();
        showTooltip(event, dataByGeoid.get(feature.properties.geoid));
      })
      .on('pointermove', (event) => moveTooltip(event))
      .on('pointerleave', function() { d3.select(this).classed('is-active', false); hideTooltip(); })
      .on('focus', function(event, feature) { d3.select(this).classed('is-active', true).raise(); showTooltip(event, dataByGeoid.get(feature.properties.geoid)); })
      .on('blur', function() { d3.select(this).classed('is-active', false); hideTooltip(); })
      .on('click', function(event, feature) {
        const datum = dataByGeoid.get(feature.properties.geoid);
        const alreadyActive = d3.select(this).classed('is-selected');
        svg.selectAll('.tract-shapes path').classed('is-selected', false);
        if (alreadyActive) return hideTooltip();
        d3.select(this).classed('is-selected', true).raise();
        showTooltip(event, datum);
      });

    svg.append('g').attr('class', 'tract-borough-boundaries').selectAll('path')
      .data(boroughBoundaries.features)
      .join('path')
      .attr('d', path);

    const legend = svg.append('g').attr('class', 'tract-map-legend').attr('transform', 'translate(34, 48)');
    legend.append('text').text('Rent Burden Rate');
    legend.append('rect').attr('y', 12).attr('width', 190).attr('height', 13).attr('fill', 'url(#tract-rent-burden-gradient)');
    legend.append('text').attr('y', 43).text('0%');
    legend.append('text').attr('x', 190).attr('y', 43).attr('text-anchor', 'end').text('90%');
  } catch (error) {
    container.innerHTML = '<p class="map-error">The census tract map could not be loaded.</p>';
    console.error(error);
  }
})();
