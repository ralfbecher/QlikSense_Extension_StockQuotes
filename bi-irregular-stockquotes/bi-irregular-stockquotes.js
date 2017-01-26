define(["jquery", "underscore", "./d3.v3.min", "css!./nv.d3.min.css"],
    function ($, _) {
        'use strict';
        var actualChartType = {};

        return {
            initialProperties: {
                qHyperCubeDef: {
                    qDimensions: [],
                    qMeasures: [],
                    qInitialDataFetch: [{
                        qWidth: 0,
                        qHeight: 0
				}]
                }
            },
            definition: {
                type: "items",
                component: "accordion",
                items: {
                    dimensions: {
                        uses: "dimensions",
                        min: 0,
                        max: 0
                    },
                    measures: {
                        uses: "measures",
                        min: 0,
                        max: 0
                    },
                    settings: {
                        uses: "settings",
                        items: {
                            stockSymbol: {
                                ref: "stockSymbol",
                                type: "string",
                                label: "Stock Symbol",
                                defaultValue: "QLIK",
                                expression: "optional"
                            },
                            historicalDays: {
                                ref: "historicalDays",
                                type: "number",
                                label: "Historical Days",
                                defaultValue: 32,
                                expression: "optional"
                            },
                            chartType: {
                                ref: "chartType",
                                type: "string",
                                component: "dropdown",
                                label: "Chart Type",
                                options: [{
                                        value: "ohlc",
                                        label: "OHLC"
								}, {
                                        value: "candlestick",
                                        label: "Candlestick"
								}
								],
                                defaultValue: "ohlc"
                            }
                        }
                    }
                }
            },
            snapshot: {
                canTakeSnapshot: true
            },
            
            template: '<div qv-extension style="height: 100%; width: 100%;"></div>',

            controller: ["$scope", "$element", function (scope, element) {
                scope.vm = {};

                function render(element, layout) {
                    var width = element.width(),
                        height = element.height(),
                        chartType = layout.chartType,
                        chartTypeChanged = false;

                    if (!actualChartType.hasOwnProperty(layout.qInfo.qId)) {
                        actualChartType[layout.qInfo.qId] = chartType;
                    } else {
                        chartTypeChanged = !(actualChartType[layout.qInfo.qId] === chartType);
                        actualChartType[layout.qInfo.qId] = chartType;
                    }
                    
                    var endDate = new Date();
                    var startDate = new Date();
                    startDate.setDate(endDate.getDate() - layout.historicalDays);
                    var query = 'select * from yahoo.finance.historicaldata where symbol = "' + layout.stockSymbol + '" and startDate="' + startDate.toISOString().slice(0, 10) + '" and endDate="' + endDate.toISOString().slice(0, 10) + '"';
                    var api = 'https://query.yahooapis.com/v1/public/yql?q=' + encodeURIComponent(query) + '&env=http%3A%2F%2Fdatatables.org%2Falltables.env&format=json&_maxage=3600';
                    // console.log(query);	
                    var dataNVD3 = [];

                    $.ajax({
                        type: 'GET',
                        url: api,
                        dataType: 'json'
                    }).always(function () {
                        // console.log(arguments);
                        if (arguments[1] === "success" && arguments[0].query.count > 0) {
                            if (arguments[0].query.results.quote instanceof Array) {
                                dataNVD3 = arguments[0].query.results.quote.map(function (row) {
                                    return {
                                        "date": (new Date(row.Date)).getTime(),
                                        "open": parseFloat(row.Open),
                                        "high": parseFloat(row.High),
                                        "low": parseFloat(row.Low),
                                        "close": parseFloat(row.Close)
                                    };
                                });
                            } else {
                                dataNVD3 = [{
                                    "date": (new Date(arguments[0].query.results.quote.Date)).getTime(),
                                    "open": parseFloat(arguments[0].query.results.quote.Open),
                                    "high": parseFloat(arguments[0].query.results.quote.High),
                                    "low": parseFloat(arguments[0].query.results.quote.Low),
                                    "close": parseFloat(arguments[0].query.results.quote.Close)
				                }];
                            }
                            dataNVD3.sort(function (o1, o2) {
                                return o1.date - o2.date;
                            });

                            // Transform data set into required format for NVD3
                            dataNVD3 = d3.nest()
                                .key(function (d) {
                                    return 'All';
                                })
                                .entries(dataNVD3);

                            if (chartTypeChanged) {
                                d3.select(element[0]).select('svg').remove();
                            }
                            
                            var svg = d3.select(element[0]).select('svg');
                            
                            if (svg[0][0]) {
                                svg.style('width', width)
                                    .style('height', height);
                            } else {
                                svg = d3.select(element[0]).select('div')
                                    .append("svg")
                                    .style('width', width)
                                    .style('height', height);
                            }   

                            var chart;

                            // Create the graph in NVD3
                            nv.addGraph(function () {

                                // Select whether OHLC or Candlestick
                                chart = (chartType === 'ohlc' ? chart = nv.models.ohlcBarChart() : chart = nv.models.candlestickBarChart())
                                    .x(function (d) {
                                        return d['date']
                                    })
                                    .y(function (d) {
                                        return d['close']
                                    })
                                    .duration(250)
                                    .margin({
                                        left: 75,
                                        bottom: 50,
                                        right: 30
                                    });

                                // chart sub-models (ie. xAxis, yAxis, etc) when accessed directly, return themselves, not the parent chart, so need to chain separately
                                chart.xAxis
                                    .axisLabel("Dates")
                                    // use this tickformat for Sense Hypercube data
                                    .tickFormat(function (d) {
                                        return d3.time.format('%x')(new Date(d))
                                    });;

                                chart.yAxis
                                    .axisLabel('Stock Price')
                                    .tickFormat(function (d, i) {
                                        return d3.format(',.2f')(d);
                                    });

                                // call the chart
                                d3.select(svg[0][0])
                                    .datum(dataNVD3)
                                    .transition().duration(500)
                                    .call(chart);
                                nv.utils.windowResize(chart.update);
                                return chart;
                            });

                        } else {

                        }
                    });

                }
                scope.vm.renderMeLater = _.debounce(render, 250);

                scope.vm.getSizing = function () {
                    return {
                        height: element.height(),
                        width: element.width()
                    };
                };

                scope.component.model.Validated.bind(function () {
                    //console.log("render validated")
                    render(element, scope.layout);
                });

                scope.$watch(scope.vm.getSizing, function (newValue, oldValue) {
                    //console.log("scope.vm.getSizing", (new Date).getTime(), newValue, oldValue);
                    // subtitle frame and selection frame reduces size
                    if (Math.abs(oldValue.height - newValue.height) > 23 || Math.abs(oldValue.width - newValue.width) > 34) {
                        //console.log("render resize")
                        scope.vm.renderMeLater(element, scope.layout);
                    }
                }, true);
            }]
        };
    });