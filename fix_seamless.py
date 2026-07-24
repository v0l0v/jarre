import os
from PIL import Image

def make_seamless(path):
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    
    blend_width = int(w * 0.15)
    
    left_edge = img.crop((0, 0, blend_width, h))
    right_edge = img.crop((w - blend_width, 0, w, h))
    
    mask = Image.new("L", (blend_width, h))
    for x in range(blend_width):
        alpha = int(255 * (x / float(blend_width))) 
        for y in range(h):
            mask.putpixel((x, y), alpha)
            
    right_edge.paste(left_edge, (0, 0), mask)
    img.paste(right_edge, (w - blend_width, 0))
    
    img.convert("RGB").save(path, "JPEG")

for root, dirs, files in os.walk("assets/planeta"):
    for f in files:
        if f == "textura.jpg":
            print("Processing", os.path.join(root, f))
            make_seamless(os.path.join(root, f))
