exports.base64ToBuffer = (base64Image) => {
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(cleanBase64, 'base64');
};
