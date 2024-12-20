import React, {useEffect, useState} from 'react'

import {BrowserRouter as Router, Routes, Route, Link, useNavigate} from "react-router-dom"
import Button from 'react-bootstrap/Button'

import 'bootstrap/dist/css/bootstrap.css'

import Monitor from '../Monitor/Monitor.jsx'
import './Home.css'




import frontpageImage from '../../assets/webpage_monitor_frontpage.jpeg'

function Home() {
  const navigate = useNavigate();

  const [server_url,] = useState(import.meta.env.DEV ?
      import.meta.env.VITE_DEVELOPMENT_SERVER_URL : import.meta.env.VITE_PRODUCTION_SERVER_URL)
  const [sessionKey, setSessionKey] = useState('')
  const [isValidHttpURL, setIsValidHttpURL] = useState(false)
  const [urlText, setURLText] = useState('')
  const [buttonText, setButtonText] = useState('Enter valid URL')

  const handleChange = async (newValue) => {
    setURLText(newValue)
    setIsValidHttpURL(validateURL(newValue))
    if (isValidHttpURL)
      setButtonText("Click to Monitor")
    else if (buttonText !== 'Enter valid URL') // no unnecessary updates
      setButtonText('Enter valid URL')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      /*
      create response with url in body and send it to server at api endpoint monitor
      */
      await fetch(server_url + '/monitor', {  // server_url is the URL of the server to send the request to
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          },
        body: //form data
            JSON.stringify({ webpageURL: urlText })
      })
          .then(response => {
            if (response.ok) {
              if (import.meta.env.DEV) {
                console.log('Value sent successfully')
              }
              navigate("monitor")
            }
            else
            if (import.meta.env.DEV)
              console.error('Failed to send value:', response.statusText)

          })
          .catch(error => {
            if (import.meta.env.DEV)
              console.error('Error sending value:', error.message)
          })
    } catch (error) {
      if (import.meta.env.DEV)
        console.error('Error sending value:', error.message)
    }


    // try {
    //   const response = await fetch(server_url, {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json',
    //     },
    //     body: JSON.stringify({ urlText }),
    //   });
    //
    //   if (import.meta.env.DEV) {
    //     if (response.ok) {
    //       console.log(server_url)
    //       console.log('Value sent successfully');
    //     } else {
    //       console.log(server_url)
    //       console.error('Failed to send value:', response.statusText);
    //     }
    //   }
    // } catch (error) {
    //   if (import.meta.env.DEV) {
    //     console.error('Error sending value:', error.message);
    //   }
    // }
  };

  const validateURL = (string) => {
    let url;
    try {
      url = new URL(string);
    } catch (err) {
      return false;
    }
    return url.protocol === "http:" || url.protocol === "https:";
  }

  // useEffect(async () => {
  //   try {
  //     const response = await fetch(server_url, {
  //       method: 'GET',
  //       headers: {
  //         'Content-Type': 'application/json',
  //       },
  //     });
  //
  //     if (response.ok) {
  //       const data = await response.json();
  //       setSessionKey(data.sessionKey);
  //     } else if (import.meta.env.DEV) {
  //       console.error('Failed to get session key:', response.statusText);
  //     }
  //   } catch (error) {
  //     if (import.meta.env.DEV)
  //       console.error('Error getting session key:', error.message);
  //   }
  // }(), [sessionKey, server_url]);

  return (
        <div id="center-container">
          <img id='frontpage-image' src={frontpageImage}
               alt='Webpage open on a screen and a blue-collar worker, presumably the one who monitors it'>
          </img>
          <div id='searchbox-container'>
            <form onSubmit={handleSubmit}>
              <input
                  onPaste={(e) => handleChange(e.target.value)}
                  onInput={(e) => handleChange(e.target.value)}
                  onKeyUp={(e) => handleChange(e.target.value)}
                  id='searchbox' type='text' placeholder='Enter URL (for example https://google.com)'
                  autoFocus
              >
              </input>
            </form>
            <Button id='searchbox-button' onClick={(e) => handleSubmit(e)}>
              {buttonText}
            </Button>
          </div>
        </div>
  )
}

export default Home