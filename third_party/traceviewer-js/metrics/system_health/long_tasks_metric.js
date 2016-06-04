/**
Copyright 2016 The Chromium Authors. All rights reserved.
Use of this source code is governed by a BSD-style license that can be
found in the LICENSE file.
**/

require("../metric_registry.js");
require("../../model/helpers/chrome_model_helper.js");
require("../../value/numeric.js");
require("../../value/value.js");

'use strict';

global.tr.exportTo('tr.metrics.sh', function() {
  var LONG_TASK_MS = 50;

  // Anything longer than this should be so rare that its length beyond this is
  // uninteresting.
  var LONGEST_TASK_MS = 1000;

  var timeDurationInMs_smallerIsBetter =
    tr.v.Unit.byName.timeDurationInMs_smallerIsBetter;

  /**
   * This helper function calls |cb| for each of the top-level tasks on the
   * given thread in the given range whose duration is longer than LONG_TASK_MS.
   *
   * @param {tr.model.Thread} thread
   * @param {tr.b.Range=} opt_range
   * @param {function()} cb
   * @param {Object=} opt_this
   */
  function iterateLongTopLevelTasksOnThreadInRange(
      thread, opt_range, cb, opt_this) {
    thread.sliceGroup.topLevelSlices.forEach(function(slice) {
      if (opt_range &&
          !opt_range.intersectsExplicitRangeExclusive(slice.start, slice.end))
        return;

      if (slice.duration < LONG_TASK_MS)
        return;

      cb.call(opt_this, slice);
    });
  }

  /**
   * This helper function calls |cb| for each of the main renderer threads in
   * the model.
   *
   * @param {tr.model.Model} model The model.
   * @param {function()} cb Callback.
   * @param {Object=} opt_this Context object.
   */
  function iterateRendererMainThreads(model, cb, opt_this) {
    var modelHelper = model.getOrCreateHelper(
        tr.model.helpers.ChromeModelHelper);
    tr.b.dictionaryValues(modelHelper.rendererHelpers).forEach(
        function(rendererHelper) {
          if (!rendererHelper.mainThread)
            return;
          cb.call(opt_this, rendererHelper.mainThread);
        });
  }

  var LONG_TASK_NUMERIC_BUILDER = tr.v.NumericBuilder.createLinear(
      tr.v.Unit.byName.timeDurationInMs_smallerIsBetter,
      tr.b.Range.fromExplicitRange(LONG_TASK_MS, LONGEST_TASK_MS), 50);

  /**
   * This metric directly measures long tasks on renderer main threads.
   * This metric requires only the 'toplevel' tracing category.
   */
  function longTasksMetric(values, model) {
    var longTaskNumeric = LONG_TASK_NUMERIC_BUILDER.build();
    iterateRendererMainThreads(model, function(thread) {
      iterateLongTopLevelTasksOnThreadInRange(
          thread, undefined, function(task) {
            longTaskNumeric.add(task.duration, task.stableId);
          });
    });
    values.addValue(new tr.v.NumericValue(
        'long tasks', longTaskNumeric));
  }

  tr.metrics.MetricRegistry.register(longTasksMetric);

  return {
    longTasksMetric: longTasksMetric,
    iterateLongTopLevelTasksOnThreadInRange:
      iterateLongTopLevelTasksOnThreadInRange,
    iterateRendererMainThreads: iterateRendererMainThreads,
    LONG_TASK_MS: LONG_TASK_MS,
    LONGEST_TASK_MS: LONGEST_TASK_MS
  };
});
