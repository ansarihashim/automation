content = open('.env', 'rb').read().decode('utf-8')
import re
content = re.sub(
    r'CLOUDINARY_CLOUD_NAME=.*?CLOUDINARY_API_SECRET=[^\r\n]*(?:\r?\n)?',
    'CLOUDINARY_CLOUD_NAME=drb5sjwlj\r\nCLOUDINARY_API_KEY=649536696741486\r\nCLOUDINARY_API_SECRET=dmro6xrDnGakDpGiOqVE20hO9wA\r\n',
    content,
    flags=re.DOTALL
)
open('.env', 'wb').write(content.encode('utf-8'))
print('Written. Verifying...')
from dotenv import dotenv_values
v = dotenv_values('.env')
for k in ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']:
    print(k, '=', repr(v.get(k)))
