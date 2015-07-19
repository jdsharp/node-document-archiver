var path = require('path');

module.exports = [
  { rule    : 'My Receipts',
    enabled : true, // Defaults to true
    src     : path.join(__dirname, 'inbox/**/*'),
    match   : [
      // Require the file start with a YYYY-MM-DD prefix
      { test : 'file-prefix-fulldate' },

      // Must have the tag 'RCPT'
      { test : 'tags', required : ['RCPT'] },

      // Must end with the file extension
      { test : 'file-ext', ext : ['txt','pdf','jpg','png'] }
    ],
    run : [
      { action : 'normalize-file' },
      { action : 'categorize', category : 'John Doe' },
      { action : 'tags', add : ['TEST'] },
      { action : 'copy', dest : path.join(__dirname, 'archived/documents/') },
      { action : 'folders-by-year' },
    ]
  }
];
