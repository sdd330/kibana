define(function (require) {
  return function XAxisFactory(d3, Private) {
    var $ = require('jquery');
    var _ = require('lodash');

    var ErrorHandler = Private(require('components/vislib/lib/_error_handler'));

    /**
     * Adds an x axis to the visualization
     *
     * @class XAxis
     * @constructor
     * @param args {{el: (HTMLElement), xValues: (Array), ordered: (Object|*),
     * xAxisFormatter: (Function), _attr: (Object|*)}}
     */
    function XAxis(args) {
      if (!(this instanceof XAxis)) {
        return new XAxis(args);
      }

      this.el = args.el;
      this.xValues = args.xValues;
      this.ordered = args.ordered;
      this.xAxisFormatter = args.xAxisFormatter;
      this._attr = _.defaults(args._attr || {});
    }

    _(XAxis.prototype).extend(ErrorHandler.prototype);

    /**
     * Renders the x axis
     *
     * @method render
     * @returns {D3.UpdateSelection} Appends x axis to visualization
     */
    XAxis.prototype.render = function () {
      d3.select(this.el).selectAll('.x-axis-div').call(this.draw());
    };

    /**
     * Returns d3 x axis scale function.
     * If time, return time scale, else return d3 ordinal scale for nominal data
     *
     * @method getScale
     * @param ordered {Object|*} Time information
     * @returns {*} D3 scale function
     */
    XAxis.prototype.getScale = function (ordered) {
      if (ordered && ordered.date) {
        return d3.time.scale.utc();
      }
      return d3.scale.ordinal();
    };

    /**
     * Add domain to the x axis scale.
     * if time, return a time domain, and calculate the min date, max date, and time interval
     * else, return a nominal (d3.scale.ordinal) domain, i.e. array of x axis values
     *
     * @method getDomain
     * @param scale {Function} D3 scale
     * @param ordered {Object} Time information
     * @returns {*} D3 scale function
     */
    XAxis.prototype.getDomain = function (scale, ordered) {
      if (ordered && ordered.date) {
        return this.getTimeDomain(scale, ordered);
      }
      return this.getOrdinalDomain(scale, this.xValues);
    };

    /**
     * Returns D3 time domain
     *
     * @method getTimeDomain
     * @param scale {Function} D3 scale function
     * @param ordered {Object} Time information
     * @returns {*} D3 scale function
     */
    XAxis.prototype.getTimeDomain = function (scale, ordered) {
      return scale.domain([ordered.min, ordered.max]);
    };

    /**
     * Return a nominal(d3 ordinal) domain
     *
     * @method getOrdinalDomain
     * @param scale {Function} D3 scale function
     * @param xValues {Array} Array of x axis values
     * @returns {*} D3 scale function
     */
    XAxis.prototype.getOrdinalDomain = function (scale, xValues) {
      return scale.domain(xValues);
    };

    /**
     * Return the range for the x axis scale
     * if time, return a normal range, else if nominal, return rangeBands with a default (0.1) spacer specified
     *
     * @method getRange
     * @param scale {Function} D3 scale function
     * @param ordered {Object} Time information
     * @param width {Number} HTML Element width
     * @returns {*} D3 scale function
     */
    XAxis.prototype.getRange = function (scale, ordered, width) {
      if (ordered && ordered.date) {
        return scale.range([0, width]);
      }
      return scale.rangeBands([0, width], 0.1);
    };

    /**
     * Return the x axis scale
     *
     * @method getXScale
     * @param ordered {Object} Time information
     * @param width {Number} HTML Element width
     * @returns {*} D3 x scale function
     */
    XAxis.prototype.getXScale = function (ordered, width) {
      var scale = this.getScale(ordered);
      var domain = this.getDomain(scale, ordered);
      return this.getRange(domain, ordered, width);
    };

    /**
     * Creates d3 xAxis function
     *
     * @method getXAxis
     * @param width {Number} HTML Element width
     */
    XAxis.prototype.getXAxis = function (width) {
      this.xScale = this.getXScale(this.ordered, width);

      if (!this.xScale || _.isNaN(this.xScale)) {
        throw new Error('xScale is ' + this.xScale);
      }

      this.xAxis = d3.svg.axis()
      .scale(this.xScale)
      .ticks(10)
      .tickFormat(this.xAxisFormatter)
      .orient('bottom');
    };

    /**
     * Renders the x axis
     *
     * @method draw
     * @returns {Function} Renders the x axis to a D3 selection
     */
    XAxis.prototype.draw = function () {
      var self = this;
      var div;
      var width;
      var height;
      var svg;
      var parentWidth;
      var n;
      this._attr.isRotated = false;

      return function (selection) {
        n = selection[0].length;
        parentWidth = $(self.el)
        .find('.x-axis-div-wrapper')
        .width();

        selection.each(function () {

          div = d3.select(this);
          width = parentWidth / n;
          height = $(this).height();

          self.validateWidthandHeight(width, height);

          self.getXAxis(width);

          svg = div.append('svg')
          .attr('width', width)
          .attr('height', height);

          svg.append('g')
          .attr('class', 'x axis')
          .attr('transform', 'translate(0,0)')
          .call(self.xAxis);
        });

        selection.call(self.filterOrRotate());
      };
    };

    /**
     * Returns a function that evaluates scale type and
     * applies filter to tick labels on time scales
     * rotates and truncates tick labels on nominal/ordinal scales
     *
     * @method filterOrRotate
     * @returns {Function} Filters or rotates x axis tick labels
     */
    XAxis.prototype.filterOrRotate = function () {
      var self = this;
      var ordered = self.ordered;
      var axis;
      var labels;

      return function (selection) {
        selection.each(function () {
          axis = d3.select(this);
          labels = axis.selectAll('.tick text');
          if (!ordered || ordered === undefined) {
            axis.call(self.rotateAxisLabels());
          } else {
            axis.call(self.filterAxisLabels());
          }
        });

        self.updateXaxisHeight();

        selection.call(self.fitTitles());

      };
    };

    /**
     * Rotate the axis tick labels within selection
     *
     * @returns {Function} Rotates x axis tick labels of a D3 selection
     */
    XAxis.prototype.rotateAxisLabels = function () {
      var self = this;
      var text;
      var barWidth = self.xScale.rangeBand();
      var maxRotatedLength = 180;
      var xAxisPadding = 15;
      var svg;
      var lengths = [];
      var length;
      self._attr.isRotated = false;

      return function (selection) {
        text = selection.selectAll('.tick text');

        text.each(function textWidths() {
          lengths.push(d3.select(this).node().getBBox().width);
        });
        length = _.max(lengths);
        self._attr.xAxisLabelHt = length + xAxisPadding;

        // if longer than bar width, rotate
        if (length > barWidth) {
          self._attr.isRotated = true;
        }

        // if longer than maxRotatedLength, truncate
        if (length > maxRotatedLength) {
          self._attr.xAxisLabelHt = maxRotatedLength;
        }

        if (self._attr.isRotated) {
          text
          .text(function truncate() {
            return self.truncateLabel(this, self._attr.xAxisLabelHt);
          })
          .style('text-anchor', 'end')
          .attr('dx', '-.8em')
          .attr('dy', '-.60em')
          .attr('transform', function rotate() {
            return 'rotate(-90)';
          });
          selection.select('svg')
          .attr('height', self._attr.xAxisLabelHt);
        }
      };
    };

    /**
     * Returns a string that is truncated to fit size
     *
     * @method truncateLabel
     * @param text {HTMLElement}
     * @param size {Number}
     * @returns {*|jQuery}
     */
    XAxis.prototype.truncateLabel = function (text, size) {
      var node = d3.select(text).node();
      var str = $(node).text();
      var width = node.getBBox().width;
      var chars = str.length;
      var pxPerChar = width / chars;
      var endChar = 0;
      var ellipsesPad = 4;

      if (width > size) {
        endChar = Math.floor((size / pxPerChar) - ellipsesPad);
        while (str[endChar - 1] === ' ' || str[endChar - 1] === '-' || str[endChar - 1] === ',') {
          endChar = endChar - 1;
        }
        str = str.substr(0, endChar) + '...';
      }
      return str;
    };

    /**
     * Filter out text labels by width and position on axis
     * trims labels that would overlap each other
     * or extend past left or right edges
     * if prev label pos (or 0) + half of label width is < label pos
     * and label pos + half width  is not > width of axis
     *
     * @method filterAxisLabels
     * @returns {Function}
     */
    XAxis.prototype.filterAxisLabels = function () {
      var self = this;
      var startX = 0;
      var maxW;
      var par;
      var myX;
      var myWidth;
      var halfWidth;
      var padding = 1.1;

      return function (selection) {
        selection.selectAll('.tick text')
        .text(function (d) {
          par = d3.select(this.parentNode).node();
          myX = self.xScale(d);
          myWidth = par.getBBox().width * padding;
          halfWidth = myWidth / 2;
          maxW = $(self.el).find('.x-axis-div').width();

          if ((startX + halfWidth) < myX && maxW > (myX + halfWidth)) {
            startX = myX + halfWidth;
            return self.xAxisFormatter(d);
          } else {
            d3.select(this.parentNode).remove();
          }
        });
      };
    };

    /**
     * Returns a function that adjusts axis titles and
     * chart title transforms to fit axis label divs.
     * Sets transform of x-axis-title to fit .x-axis-title div width
     * if x-axis-chart-titles, set transform of x-axis-chart-titles
     * to fit .chart-title div width
     *
     * @method fitTitles
     * @returns {Function}
     */
    XAxis.prototype.fitTitles = function () {
      var visEls = $('.vis-wrapper');
      var xAxisChartTitle;
      var yAxisChartTitle;
      var text;
      var titles;

      return function () {

        visEls.each(function () {
          var visEl = d3.select(this);
          var $visEl = $(this);
          var xAxisTitle = $visEl.find('.x-axis-title');
          var yAxisTitle = $visEl.find('.y-axis-title');
          var titleWidth = xAxisTitle.width();
          var titleHeight = yAxisTitle.height();

          text = visEl.select('.x-axis-title')
          .select('svg')
          .attr('width', titleWidth)
          .select('text')
          .attr('transform', 'translate(' + (titleWidth / 2) + ',11)');

          text = visEl.select('.y-axis-title')
          .select('svg')
          .attr('height', titleHeight)
          .select('text')
          .attr('transform', 'translate(11,' + (titleHeight / 2) + ')rotate(-90)');

          if ($visEl.find('.x-axis-chart-title').length) {
            xAxisChartTitle = $visEl.find('.x-axis-chart-title');
            titleWidth = xAxisChartTitle.find('.chart-title').width();

            titles = visEl.select('.x-axis-chart-title').selectAll('.chart-title');
            titles.each(function () {
              text = d3.select(this)
              .select('svg')
              .attr('width', titleWidth)
              .select('text')
              .attr('transform', 'translate(' + (titleWidth / 2) + ',11)');
            });
          }

          if ($visEl.find('.y-axis-chart-title').length) {
            yAxisChartTitle = $visEl.find('.y-axis-chart-title');
            titleHeight = yAxisChartTitle.find('.chart-title').height();

            titles = visEl.select('.y-axis-chart-title').selectAll('.chart-title');
            titles.each(function () {
              text = d3.select(this)
              .select('svg')
              .attr('height', titleHeight)
              .select('text')
              .attr('transform', 'translate(11,' + (titleHeight / 2) + ')rotate(-90)');
            });
          }

        });

      };
    };

    /**
     * Appends div to make .y-axis-spacer-block
     * match height of .x-axis-wrapper
     *
     * @method updateXaxisHeight
     */
    XAxis.prototype.updateXaxisHeight = function () {
      var selection = d3.select(this.el).selectAll('.vis-wrapper');

      selection.each(function () {
        var visEl = d3.select(this);

        if (visEl.select('.inner-spacer-block').node() === null) {
          visEl.select('.y-axis-spacer-block')
          .append('div')
          .attr('class', 'inner-spacer-block');
        }
        var xAxisHt = visEl.select('.x-axis-wrapper').style('height');

        visEl.select('.inner-spacer-block').style('height', xAxisHt);
      });

    };

    return XAxis;
  };
});
