const { Jimp } = require('jimp');

async function process() {
  const imgs = ['playready-logo-light.jpg'];
  for (const file of imgs) {
    try {
      const imgPath = 'src/assets/' + file;
      console.log('Reading', imgPath);
      const image = await Jimp.read(imgPath);
      
      image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
        const r = this.bitmap.data[idx];
        const g = this.bitmap.data[idx + 1];
        const b = this.bitmap.data[idx + 2];
        
        // If not white-ish, turn to black. The logo 'P' is white.
        // We leave white pixels intact.
        if (r < 200 || g < 200 || b < 200) {
          this.bitmap.data[idx] = 0;
          this.bitmap.data[idx + 1] = 0;
          this.bitmap.data[idx + 2] = 0;
        }
      });
      
      await image.write(imgPath);
      console.log('Processed', file);
    } catch (err) {
      console.error('Error processing', file, err.message);
    }
  }
}

process();
