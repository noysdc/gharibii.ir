document.querySelectorAll('.thumbs button').forEach(function (b) {
  b.addEventListener('click', function () {
    document.getElementById('main-img').src = b.dataset.src;
  });
});
