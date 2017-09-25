/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Gatherer = require('./gatherer');
const URL = require('../../lib/url-shim');
const manifestParser = require('../../lib/manifest-parser');

class StartUrl extends Gatherer {
  constructor() {
    super();

    this.startUrl = null;
    this.err = null;
  }

  executeFetchRequest(driver, url) {
    return new Promise((resolve, reject) => {
      let requestId;
      const fetchRequestId = data => {
        if (URL.equalWithExcludedFragments(data.request.url, url)) {
          requestId = data.requestId;
          driver.off('Network.requestWillBeSent', fetchRequestId);
        }
      };
      const fetchDone = data => {
        if (data.requestId === requestId) {
          driver.off('Network.loadingFinished', fetchDone);
          driver.off('Network.loadingFailed', fetchDone);

          resolve();
        }
      };

      driver.on('Network.requestWillBeSent', fetchRequestId);
      driver.on('Network.loadingFinished', fetchDone);
      driver.on('Network.loadingFailed', fetchDone);
      driver
        .evaluateAsync(
          `fetch('${url}')
            .then(response => response.status)
            .catch(err => -1)`
        )
        .catch(err => reject(err));
    });
  }

  pass(options) {
    return options.driver
      .getAppManifest()
      .then(response => {
        return response && manifestParser(response.data, response.url, options.url);
      })
      .then(manifest => {
        if (!manifest || !manifest.value) {
          const detailedMsg = manifest && manifest.debugString;
          this.debugString = detailedMsg
            ? `Error fetching web app manifest: ${detailedMsg}`
            : `No usable web app manifest found on page ${options.url}`;
          return;
        }

        if (manifest.value.start_url.debugString) {
          // Even if the start URL had an error, the browser will still supply a fallback URL.
          // Therefore, we only set the debugString here and continue with the fetch.
          this.debugString = manifest.value.start_url.debugString;
        }

        this.startUrl = manifest.value.start_url.value;
        return this.executeFetchRequest(options.driver, this.startUrl);
      });
  }

  afterPass(options, tracingData) {
    const networkRecords = tracingData.networkRecords;
    const navigationRecord = networkRecords
      .filter(record => {
        return (
          URL.equalWithExcludedFragments(record._url, this.startUrl) &&
          record._fetchedViaServiceWorker
        );
      })
      .pop(); // Take the last record that matches.

    return options.driver.goOnline(options).then(_ => {
      if (!this.startUrl) {
        return {
          statusCode: -1,
          debugString: this.debugString || 'No start URL to fetch',
        };
      } else if (!navigationRecord) {
        return {
          statusCode: -1,
          debugString: this.debugString || 'Did not fetch start URL from service worker',
        };
      } else {
        return {
          statusCode: navigationRecord.statusCode,
          debugString: this.debugString,
        };
      }
    });
  }
}

module.exports = StartUrl;
