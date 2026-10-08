The text reader used by "Take a photo" / "Choose a photo" on the add-scan form (see m.js).
These files are fetched the first time a photo is read, never before. They are unmodified copies from npm.

tesseract.min.js, worker.min.js           tesseract.js 7.0.0        Apache License 2.0   https://github.com/naptha/tesseract.js
tesseract-core-*-lstm.wasm.js             tesseract.js-core 7.0.0   Apache License 2.0   https://github.com/naptha/tesseract.js-core
eng.traineddata.gz                        @tesseract.js-data/eng 1.0.0 (4.0.0_best_int), from tesseract-ocr/tessdata_best, Apache License 2.0

The three "core" files are the same engine built for different phones. Each phone picks the one it supports.
LICENSE is the Apache License 2.0 text. The two .LICENSE.txt files list the notices of code bundled inside the .min.js files.
To move to a newer version, put it in a new folder (ocr8, say) and point m.js and sw.js at that, so phones do not mix old and new files.
