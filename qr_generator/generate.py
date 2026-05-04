import qrcode
import os
import argparse

def generate_qrs(base_url, count, output_dir):
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    print(f"Generating {count} QR codes with base URL: {base_url}")
    
    for i in range(1, count + 1):
        unique_id = f"item_{i}"
        url = f"{base_url}/track/{unique_id}"

        qr = qrcode.make(url)
        output_path = os.path.join(output_dir, f"{unique_id}.png")
        qr.save(output_path)
        
        if i % 100 == 0:
            print(f"Generated {i} QR codes...")

    print("Finished generating all QR codes!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate QR codes for tracking.")
    parser.add_argument("--url", default="https://your-app.onrender.com", help="Base URL of your deployed backend")
    parser.add_argument("--count", type=int, default=1000, help="Number of QR codes to generate")
    
    args = parser.parse_args()
    
    # Path to the qr_codes directory at the root of the project
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    output_directory = os.path.join(project_root, "qr_codes")
    
    generate_qrs(args.url, args.count, output_directory)


# python qr_generator/generate.py --url https://qr-locator-frontend.vercel.app/?id= --count 1000