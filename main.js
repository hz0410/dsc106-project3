import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const width = 1200;
const height = 620;
const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const svg = d3.select("#map");
const lineSvg = d3.select("#line-chart");
const tooltip = d3.select("#tooltip");
const monthSlider = d3.select("#month-slider");
const monthLabel = d3.select("#month-label");
const countrySelect = d3.select("#country-select");
const selectedCountryLabel = d3.select("#selected-country");
const selectedValueLabel = d3.select("#selected-value");
const topList = d3.select("#top-list");

const projection = d3.geoNaturalEarth1()
  .fitExtent([[20, 20], [width - 20, height - 20]], { type: "Sphere" });

const path = d3.geoPath(projection);

const normalize = value => String(value ?? "").trim().toLowerCase();
const formatValue = d3.format(".3f");

Promise.all([
  d3.json("world.geojson"),
  d3.csv("aerosol_1850_by_country.csv", d => ({
    name: d.name,
    key: normalize(d.name),
    time: d.time,
    month: new Date(d.time).getUTCMonth() + 1,
    od550aer: +d.od550aer
  }))
]).then(([world, data]) => {
  const countries = Array.from(new Set(data.map(d => d.name))).sort(d3.ascending);
  let selectedCountry = countries.includes("Afghanistan") ? "Afghanistan" : countries[0];
  let selectedMonth = 1;

  const values = data.map(d => d.od550aer).filter(Number.isFinite);
  const color = d3.scaleSequentialSqrt(d3.interpolateYlOrRd)
    .domain([0, d3.max(values)]);

  const dataByMonthCountry = d3.rollup(
    data,
    v => d3.mean(v, d => d.od550aer),
    d => d.month,
    d => d.key
  );

  const countrySeries = d3.group(data, d => d.name);

  countrySelect
    .selectAll("option")
    .data(countries)
    .join("option")
    .attr("value", d => d)
    .text(d => d);

  countrySelect.property("value", selectedCountry);

  svg.append("path")
    .datum({ type: "Sphere" })
    .attr("class", "sphere")
    .attr("d", path);

  const countryPaths = svg.append("g")
    .attr("class", "countries")
    .selectAll("path")
    .data(world.features)
    .join("path")
    .attr("class", "country")
    .attr("d", path)
    .attr("data-name", d => d.properties.name)
    .on("mousemove", (event, d) => {
      const name = d.properties.name;
      const value = getCountryValue(name, selectedMonth);
      tooltip
        .hidden = false;
      tooltip
        .attr("hidden", null)
        .style("left", `${event.pageX + 14}px`)
        .style("top", `${event.pageY + 14}px`)
        .html(`
          <strong>${name}</strong><br>
          ${monthNames[selectedMonth - 1]} 1850<br>
          Aerosol optical depth: ${Number.isFinite(value) ? formatValue(value) : "No data"}
        `);
    })
    .on("mouseleave", () => {
      tooltip.attr("hidden", true);
    })
    .on("click", (event, d) => {
      const name = d.properties.name;
      if (countrySeries.has(name)) {
        selectedCountry = name;
        countrySelect.property("value", name);
        update();
      }
    });

  monthSlider.on("input", event => {
    selectedMonth = +event.target.value;
    update();
  });

  countrySelect.on("change", event => {
    selectedCountry = event.target.value;
    update();
  });

  update();

  function getCountryValue(name, month) {
    return dataByMonthCountry.get(month)?.get(normalize(name));
  }

  function update() {
    monthLabel.text(monthNames[selectedMonth - 1]);

    countryPaths
      .attr("fill", d => {
        const value = getCountryValue(d.properties.name, selectedMonth);
        return Number.isFinite(value) ? color(value) : "#1f2937";
      })
      .classed("selected", d => d.properties.name === selectedCountry);

    updateSelectedCountry();
    updateLineChart();
    updateTopList();
  }

  function updateSelectedCountry() {
    const value = getCountryValue(selectedCountry, selectedMonth);
    selectedCountryLabel.text(selectedCountry);
    selectedValueLabel.text(
      `${monthNames[selectedMonth - 1]} value: ${Number.isFinite(value) ? formatValue(value) : "No data"}`
    );
  }

  function updateTopList() {
    const rows = data
      .filter(d => d.month === selectedMonth && Number.isFinite(d.od550aer))
      .sort((a, b) => d3.descending(a.od550aer, b.od550aer))
      .slice(0, 6);

    topList.selectAll("li")
      .data(rows, d => d.name)
      .join("li")
      .html(d => `<span>${d.name}</span><strong>${formatValue(d.od550aer)}</strong>`);
  }

  function updateLineChart() {
    const margin = { top: 22, right: 20, bottom: 36, left: 48 };
    const innerWidth = 420 - margin.left - margin.right;
    const innerHeight = 260 - margin.top - margin.bottom;

    lineSvg.selectAll("*").remove();

    const series = (countrySeries.get(selectedCountry) ?? [])
      .slice()
      .sort((a, b) => d3.ascending(a.month, b.month));

    const x = d3.scaleLinear()
      .domain([1, 12])
      .range([0, innerWidth]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.od550aer)]).nice()
      .range([innerHeight, 0]);

    const g = lineSvg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(12).tickFormat(d => monthNames[d - 1].slice(0, 3)))
      .call(g => g.selectAll("text").attr("font-size", 10));

    g.append("g")
      .call(d3.axisLeft(y).ticks(5))
      .call(g => g.selectAll("text").attr("font-size", 10));

    const line = d3.line()
      .defined(d => Number.isFinite(d.od550aer))
      .x(d => x(d.month))
      .y(d => y(d.od550aer));

    g.append("path")
      .datum(series)
      .attr("class", "trend-line")
      .attr("d", line);

    g.selectAll("circle")
      .data(series)
      .join("circle")
      .attr("class", d => d.month === selectedMonth ? "trend-point active" : "trend-point")
      .attr("cx", d => x(d.month))
      .attr("cy", d => y(d.od550aer))
      .attr("r", d => d.month === selectedMonth ? 5 : 3);

    g.append("text")
      .attr("class", "axis-label")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 34)
      .attr("text-anchor", "middle")
      .text("Month in 1850");

    g.append("text")
      .attr("class", "axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -36)
      .attr("text-anchor", "middle")
      .text("AOD");
  }
}).catch(error => {
  console.error(error);
  d3.select("main").insert("p", ":first-child")
    .attr("class", "error")
    .text("Could not load the data. Make sure world.geojson and aerosol_1850_by_country.csv are in the same folder as index.html.");
});
