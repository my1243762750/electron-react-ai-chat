import { net } from 'electron'

/**
 * Call Doubao Vision Model
 * @param {string} prompt - User text
 * @param {Array} attachments - Array of { type: 'image', content: 'base64...' }
 * @param {string} apiKey - API Key
 * @param {function} onToken - Callback for stream
 * @returns {Promise<string>}
 */
export async function callVisionModel(prompt, attachments, apiKey, onToken) {
  return new Promise((resolve, reject) => {
    // 1. Construct Payload
    // Format: "data:image/jpeg;base64,..." -> need to extract just the base64 part for some APIs, 
    // but OpenAI format usually accepts "data:image/..." in url field directly?
    // User's example used a URL. For Base64, OpenAI spec (which Doubao often follows) uses "url": "data:image/jpeg;base64,{base64_image}"
    
    const content = []
    
    // Add Images
    attachments.forEach(att => {
      if (att.type === 'image') {
        content.push({
          type: "image_url",
          image_url: {
            url: att.content // Expecting full data URI
          }
        })
      }
    })
    
    // Add Text
    content.push({
      type: "text",
      text: prompt
    })

    const payload = {
      model: "doubao-seed-1-6-vision-250815", // User provided ID
      messages: [
        {
          role: "user",
          content: content
        }
      ],
      stream: true
    }

    const request = net.request({
      method: 'POST',
      url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    })

    request.write(JSON.stringify(payload))

    let fullContent = ''
    
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        let errBody = ''
        response.on('data', c => errBody += c)
        response.on('end', () => reject(new Error(`API Error ${response.statusCode}: ${errBody}`)))
        return
      }

      response.on('data', (chunk) => {
        const lines = chunk.toString().split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') return
            try {
              const json = JSON.parse(data)
              const content = json.choices[0]?.delta?.content || ''
              if (content) {
                fullContent += content
                onToken(content)
              }
            } catch (e) { }
          }
        }
      })

      response.on('end', () => {
        resolve(fullContent)
      })
    })

    request.on('error', (err) => reject(err))
    request.end()
  })
}