import http.server
import socketserver
import json
import re
import os

PORT = 8001
PASSWORD = "80558055"

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/mkplaneta':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data)
                
                if data.get('password') != PASSWORD:
                    self.send_response(401)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(b'{"error": "Contrasena incorrecta o denegada"}')
                    return
                
                new_planet = data.get('planet')
                if not new_planet:
                    self.send_response(400)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(b'{"error": "Datos del planeta no proporcionados"}')
                    return

                # Read the current planets.js file
                with open('planets.js', 'r', encoding='utf-8') as f:
                    content = f.read()

                planet_str = json.dumps(new_planet, ensure_ascii=False, indent=4)
                
                # Find the end of the array to inject the new planet
                insertion_point = content.rfind(']')
                if insertion_point != -1:
                    before = content[:insertion_point].rstrip()
                    # Add a comma if there isn't one (assuming the array isn't completely empty without a previous element)
                    if before.endswith('}'):
                        new_content = before + ',\n' + planet_str + '\n];\n'
                    else:
                        new_content = before + '\n' + planet_str + '\n];\n'
                    
                    # Write it back
                    with open('planets.js', 'w', encoding='utf-8') as f:
                        f.write(new_content)
                        
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(b'{"status": "ok"}')
                else:
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(b'{"error": "No se pudo parsear planets.js"}')

            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
    print(f"Servidor activo con soporte para guardado en el puerto {PORT}")
    httpd.serve_forever()
