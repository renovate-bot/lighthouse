/**
Copyright (c) 2015 The Chromium Authors. All rights reserved.
Use of this source code is governed by a BSD-style license that can be
found in the LICENSE file.
**/

require("../../importer/importer.js");
require("../../model/model.js");
require("../../model/power_series.js");

/**
 * @fileoverview Imports text files in the BattOr format into the
 * Model. This format is output by the battor_agent executable and library.
 *
 * This importer assumes the events arrive as a string. The unit tests provide
 * examples of the trace format.
 */
'use strict';

global.tr.exportTo('tr.e.importer.battor', function() {
  /**
   * Imports a BattOr power trace into a specified model.
   * @constructor
   */
  function BattorImporter(model, events) {
    this.importPriority = 3; // runs after the linux_perf importer
    this.model_ = model;
    this.samples_ = this.linesToSamples_(events.split('\n'));
  }

  var battorDataLineRE = new RegExp(
      '^(-?\\d+\\.\\d+)\\s+(-?\\d+\\.\\d+)\\s+(-?\\d+\\.\\d+)' +
      '(?:\\s+<(\\S+)>)?$'
  );
  var battorHeaderLineRE = /^# BattOr/;

  /**
   * Guesses whether the provided events is a BattOr string.
   * Looks for the magic string "# BattOr" at the start of the file,
   *
   * @return {boolean} True when events is a BattOr array.
   */
  BattorImporter.canImport = function(events) {
    if (!(typeof(events) === 'string' || events instanceof String))
      return false;

    return battorHeaderLineRE.test(events);
  };

  BattorImporter.prototype = {
    __proto__: tr.importer.Importer.prototype,

    get importerName() {
      return 'BattorImporter';
    },

    get model() {
      return this.model_;
    },

    /**
     * Imports clock sync markers in this.events_ into model_.
     */
    importClockSyncMarkers: function() {
      for (var i = 0; i < this.samples_.length; i++) {
        var sample = this.samples_[i];
        if (sample.syncId) {
          this.model_.clockSyncManager.addClockSyncMarker(
              tr.model.ClockDomainId.BATTOR, sample.syncId, sample.ts);
        }
      }
    },

    /**
     * Imports the data in this.events_ into model_.
     */
    importEvents: function() {
      if (this.model_.device.powerSeries) {
        this.model_.importWarning({
          type: 'import_error',
          message: 'Power counter exists, can not import BattOr power trace.'
        });
        return;
      }

      var modelTimeTransformer =
          this.model_.clockSyncManager.getModelTimeTransformer(
              tr.model.ClockDomainId.BATTOR);

      var powerSeries = this.model_.device.powerSeries =
          new tr.model.PowerSeries(this.model_.device);
      for (var i = 0; i < this.samples_.length; i++) {
        var sample = this.samples_[i];
        powerSeries.addPowerSample(
            modelTimeTransformer(sample.ts), sample.power);
      }
    },

    /**
     * Given an array of strings that make up the lines of a BattOr trace,
     * returns an array of samples contained within those lines.
     */
    linesToSamples_: function(lines) {
      var samples = [];

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        line = line.trim();

        if (line.length === 0)
          continue;

        if (line.startsWith('#'))
          continue;

        // Parse power sample.
        var groups = battorDataLineRE.exec(line);
        if (!groups) {
          this.model_.importWarning({
            type: 'parse_error',
            message: 'Unrecognized line in BattOr trace: ' + line
          });
          continue;
        }

        var ts = parseFloat(groups[1]);
        var voltage = parseFloat(groups[2]) / 1000;
        var current = parseFloat(groups[3]) / 1000;
        var syncId = groups[4];

        if (voltage < 0 || current < 0) {
          this.model_.importWarning({
            type: 'parse_error',
            message: 'The following line in the BattOr trace has a negative ' +
                'voltage or current, neither of which are allowed: ' + line +
                '. A common cause of this is that the device is charging ' +
                'while the trace is being recorded.'
          });
          continue;
        }

        samples.push(new Sample(ts, voltage, current, syncId));
      }

      return samples;
    }
  };

  /**
   * A sample recorded by a BattOr.
   *
   * @param {number} ts The timestamp (in milliseconds) of the sample.
   * @param {number} voltage The voltage (in volts) at the specified time.
   * @param {number} current The current (in amps) at the specified time.
   * @param {string=} opt_syncId The sync ID of the sync that happened at this
   *     sample.
   *
   * @constructor
   */
  function Sample(ts, voltage, current, opt_syncId) {
    this.ts = ts;
    this.voltage = voltage;
    this.current = current;
    this.syncId = opt_syncId;
  }

  Sample.prototype = {
    /** Returns the instantaneous power consumption (in Watts). */
    get power() { return this.voltage * this.current; }
  };

  tr.importer.Importer.register(BattorImporter);

  return {
    BattorImporter: BattorImporter,
  };
});

