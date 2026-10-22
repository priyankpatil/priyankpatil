# Calibration sheet 1

15 conversations. Score each with [RUBRIC.md](../RUBRIC.md) and record your answers in `sheet-1.csv` (one row per conversation, already listed).
Score blind: don't look up the judge's or ground truth's answers first. Then import with `calibration.mts --import --rater <name>`.

## 1. abcd-4585

- Logged contact reason (may be wrong): `credit_card`
- Policy steps for it: try-again → log-out-in → enter-details → make-purchase

```
AGENT: Hello, how may I help you today?
CUSTOMER: Hello, my name is Joyce Wu
ACTION: [pull-up-account] Account has been pulled up for Joyce Wu.
CUSTOMER: I'm trying to buy jeans for myself but my card keeps declining.
CUSTOMER: It says it is invalid.
AGENT: I am so sorry to hear that. Please give me a moment to look into that for you.
CUSTOMER: WHy is this happening?
ACTION: [try-again] Agent is looking for solutions ...
AGENT: Can you please go back to the checkout page and try entering your credit card information again?
CUSTOMER: YES
CUSTOMER: Stll no luck
ACTION: [log-out-in] Agent is looking for solutions ...
AGENT: Can you please try logging out of your account and logging back in?
CUSTOMER: Ok let me try
CUSTOMER: Ah it seems that has worked.
CUSTOMER: I'm able to check out now
CUSTOMER: Thanks so much
AGENT: I am glad that we were able to resolve the issue. Thank you for your patience.
AGENT: You are welcome.
AGENT: Is there anything else I can help you with today?
CUSTOMER: Perfect.
CUSTOMER: No that will be all!
AGENT: Thank you. Have a great day!
```

## 2. abcd-5686

- Logged contact reason (may be wrong): `recover_password`
- Policy steps for it: pull-up-account → enter-details → make-password

```
CUSTOMER: Hi! I need to check my shopping histry
CUSTOMER: But I can't get into my account! I forgot my password
CUSTOMER: Can you help?
AGENT: Hello, I can help you with that. What is your name?
CUSTOMER: Rodriguez Domingo
AGENT: Thank you, do you know your username?
ACTION: [pull-up-account] Account has been pulled up for Rodriguez Domingo.
CUSTOMER: ummm
CUSTOMER: rodriguezd228
CUSTOMER: I do remember that!
ACTION: [enter-details] Details of rodriguezd228 have been entered.
AGENT: Perfect, thanks! I cannot recover your password but I can create a new, temporary password for you to use.
CUSTOMER: Okay
CUSTOMER: That would be fine
AGENT: To do so, I will need either your pin number or answer to your security question.
CUSTOMER: Okay
CUSTOMER: I have my pin written down
CUSTOMER: It's 225776
ACTION: [make-password] A password has been generated.
AGENT: Here is your new password: oupyq5hh4xn
CUSTOMER: Okay
AGENT: Is there anything else I can help you with today?
CUSTOMER: Can you wait while I try it? I want to make sure I can log in
AGENT: Definitely!
CUSTOMER: I just used the new password to log in
CUSTOMER: I can see my shopping history now
CUSTOMER: Thank you!
AGENT: Great! Happy to help :)
AGENT: You have a nice day
```

## 3. abcd-2112

- Logged contact reason (may be wrong): `recover_username`
- Policy steps for it: pull-up-account → verify-identity

```
AGENT: Hi, what can I do for you?
CUSTOMER: I want to log into my account, but I forgot my username. Can you help me?
AGENT: Sure, can I have your name please
CUSTOMER: My name is Rodriguez Domingo.
ACTION: [pull-up-account] Account has been pulled up for Rodriguez Domingo.
AGENT: Okay, I need to verify your identity, can I have your zip code and phone number please
CUSTOMER: My zip code is 47733. Phone# is 011 189 5099
ACTION: [verify-identity] Identity verification in progess ...
AGENT: Thank you, your username is rdomingo1
AGENT: What else can I do for you?
CUSTOMER: Nope, that's it. Thank you so much.
AGENT: Have a good day
```

## 4. abcd-7815

- Logged contact reason (may be wrong): `manage_create`
- Policy steps for it: pull-up-account → verify-identity → shipping-status → membership → make-purchase

```
AGENT: Hi
CUSTOMER: Hello!
AGENT: How can I help you today!
CUSTOMER: Can you help me add an item to my order?
AGENT: Absolutely.
AGENT: What is your full name or account ID?
CUSTOMER: Great!   I forgot to add it to my cart earlier
CUSTOMER: It's a Guess Shirt
AGENT: Not a problem, I understand.
AGENT: I am going to need your full name, account ID, and order ID, so I can pull all of this up.
CUSTOMER: Sanya Afzal
CUSTOMER: IME4G5NC13 is my account id
CUSTOMER: Order ID: 3592052485
ACTION: [verify-identity] Identity verification in progress ...
AGENT: Fantastic.
AGENT: What is the shipping status?
CUSTOMER: It says Delivered
ACTION: [shipping-status] Shipping status of Delivered has been noted.
AGENT: Now, what is your membership level?
CUSTOMER: It is Gold
AGENT: Since you are gold member, I will ship this item out to you ASAP!
CUSTOMER: Wow!  That's so awesome, thanks!
AGENT: No shipping fee either!
CUSTOMER: Excellent!
ACTION: [membership] Membership level of gold has been noted.
AGENT: You want to order the Guess Shirt, correct?
CUSTOMER: Yes please
CUSTOMER: it was $79
ACTION: [make-purchase] A purchase of Guess Shirt was made.
AGENT: I have purchased it and it will arrive soon.
AGENT: Is there anything else I can do for you today?
CUSTOMER: Thank you so much!  That is all for today
AGENT: Great! You have a good day now!
```

## 5. abcd-6468

- Logged contact reason (may be wrong): `reset_2fa`
- Policy steps for it: pull-up-account → enter-details → send-link

```
AGENT: Hi! How may I help you today?
CUSTOMER: Hello, I cannot access my account because I have lost my phone and need it to get the two factor authentication
CUSTOMER: can you help me?
AGENT: Ok, I can help with that
AGENT: What is your name?
CUSTOMER: Crystal Minh
ACTION: [pull-up-account] Account has been pulled up for Crystal Minh.
AGENT: Can I have your email address
CUSTOMER: crystalming45@email.com
ACTION: [enter-details] Details of crystalming45@email.com have been entered.
AGENT: I have sent you an email. It will include a code and all the information you need to get back into your accound
ACTION: [send-link] A link will be sent.
AGENT: I have also sent a link about account security
CUSTOMER: Thank you
AGENT: Is there anything else I can help with today?
CUSTOMER: That is all
AGENT: Great! Enjoy the rest of your day
```

## 6. abcd-3643

- Logged contact reason (may be wrong): `timing_3`
- Policy steps for it: none (FAQ intent)

```
AGENT: Hello, how can I help you today?
CUSTOMER: Hi I have a quick question
CUSTOMER: I was wondering when your annual sale will begin this year? Not sure if it's been delayed because of the coronavirus
AGENT: Alright, may I ask who I am speaking with?
CUSTOMER: Sanya Afzal
ACTION: [pull-up-account] Account has been pulled up for Sanya Afzal.
AGENT: Let me pull up that information for you Sanya.
ACTION: [search-faq] Searching the FAQ pages ...
ACTION: [search-timing] System Action: search timing
CUSTOMER: thanks
ACTION: [select-faq] FAQ answer related to timing (question3) was selected.
AGENT: Since the annual sales starts the third week in January, it should not be affected. I sure hope this is all over by then!
CUSTOMER: yeah ok thanks.
CUSTOMER: I have to find ways to stretch out my dollar
AGENT: I can certainly understand that! Is there anything else you need help with today?
CUSTOMER: that's it thanks
AGENT: Thanks Sanya. Have a great day and stay safe!
```

## 7. abcd-8803

- Logged contact reason (may be wrong): `status`
- Policy steps for it: pull-up-account → verify-identity → validate-purchase → ask-the-oracle → update-order

```
AGENT: Hi, thanks for contacting Acme client support. How can I help you today?
CUSTOMER: Hello, I would like to make sure the shipping cost is included in my order as I got an email saying otherwise
AGENT: I'm happy to check that out for you. May I please have your full name?
CUSTOMER: Sanya Afzal
AGENT: One moment, Ms. Afzal.
AGENT: Can I have your Account ID and your Order ID?
CUSTOMER: Z5HMMSWGXY, 7991328292
ACTION: [verify-identity] Identity verification in progress ...
AGENT: Great. I'll also need your Username and email address and to access that order. Do you have that information available?
CUSTOMER:  safzal96, safzal96@email.com, 7991328292
ACTION: [validate-purchase] Purchase validation in progress ...
AGENT: Just a minute while I search our system for you.
CUSTOMER: ok
ACTION: [ask-the-oracle] Querying the system for an answer ...
AGENT: I have good news. Shipping is included and the email was incorrect. You will not see a separate charge for that shipping.
CUSTOMER: Ok great, thanks so much
AGENT: Of course. Is there anything else that I can help you with today?
CUSTOMER: That is all I needed
AGENT: Thanks for shopping with Acme. Have a great day!
```

## 8. abcd-556

- Logged contact reason (may be wrong): `manage_create`
- Policy steps for it: pull-up-account → verify-identity → shipping-status → membership → make-purchase

```
AGENT: Hello, thank you for contacting us. What can I help you with today?
CUSTOMER: Hi. I just placed an order, but I have one more item I forgot to add to the shopping cart. Can I still add it?
AGENT: I'll do my best to help with the issue. Can I please have your first and last name to pull up your account?
CUSTOMER: Sanya Afzal
ACTION: [pull-up-account] Account has been pulled up for Sanya Afzal.
CUSTOMER: Do you need my account ID?
AGENT: Yes, I'm goign to need your Account ID and Order ID as well
CUSTOMER: The account ID is 5P7CSAI7PJ.
CUSTOMER: The order ID is 4302829760
AGENT: thank you very much, And we're addind an item to your order correct?
CUSTOMER: Yes. I want to add some Calvin Klein jeans to the order.
AGENT: Alright no problem one second
AGENT: Alright first lets check on the shipping status,
ACTION: [verify-identity] Identity verification in progess ...
AGENT: do you have your username and email address handy?
CUSTOMER: I'm sorry. I don't remember my username.
AGENT: No problem I can recover that for you while we're at it.
AGENT: For the username I'll need your zip code and phone number or email address.
CUSTOMER: My zip code is 62446. My phone number is (434) 528 9367e number is (434) 528-e number is (434) 528-
ACTION: [verify-identity] Identity verification in progess ...
AGENT: Alright thanks for that, your username is safzal1
CUSTOMER: thank you.
AGENT: Now lets get back to adding the Calvin klein jeans to your order.
AGENT: to validate the puchase I just need your email address now
CUSTOMER: Safzal@gmail.com
ACTION: [validate-purchase] Purchase validation in progress ...
AGENT: Alright on your status page does the shipping status say it's In transit out for delivery, order received or delivered?
CUSTOMER: It just says order received. I just placed the order earlier today.
AGENT: Awesome, ill be able to add the item then.
CUSTOMER: Great!
ACTION: [shipping-status] Shipping status of Order Received has been noted.
CUSTOMER: Thank you for your help.
ACTION: [update-order] Order has been updated with Add item: Calvin Klein Jeans.
AGENT: The price of the jeans will be deducted from the payment method you have on file.
AGENT: Was there anything else I could help you with today?
CUSTOMER: No. That's it. Thanks again.
AGENT: Not a problem, Have a great day!
```

## 9. abcd-130

- Logged contact reason (may be wrong): `manage_change_name`
- Policy steps for it: pull-up-account → record-reason → verify-identity → update-account

```
AGENT: hello, thank you for contacting AcmeBrands, how may i help you?
CUSTOMER: Hi there the name on my account is wrong can someone change it?
AGENT: Ah, ok
AGENT: what is the name on there right now?
CUSTOMER: It reals Hairy Pancakes
CUSTOMER: should read Sanya Afzal
CUSTOMER: no clue what happened
CUSTOMER: XD
AGENT: Hairy Pancakes, thats not right!
CUSTOMER: reads I mean
AGENT: got it
CUSTOMER: yeah can you fix it?
AGENT: let me look into it for you
CUSTOMER: My fingers were bit by wild dogs
CUSTOMER: hard to type
CUSTOMER: Im not even joking
AGENT: ok, so i have your account
CUSTOMER: yeah and
AGENT: let me verify your identity, do you have a phone number or order iD?
CUSTOMER: can u fix it?
AGENT: yes, i can fix it
CUSTOMER: oh sure 5919 lincoln ave
AGENT: but i need to gather some details first
CUSTOMER: I bought some jeans for 84
CUSTOMER: dont know my order id
CUSTOMER: Im a silver member too
AGENT: do you perhaps have a PIN number instead?
AGENT: or email address?
CUSTOMER: cause I spend that mturk monies
CUSTOMER: nope no pin
CUSTOMER: email is Onebadmofo@yahoo.com
AGENT: ok, this seems to check out
CUSTOMER: oh thank you Jesus
AGENT: Great, i have updated your account with the correct name
CUSTOMER: you are so best and good
AGENT: is there anything else i can help you with?
CUSTOMER: no you saved me
AGENT: wonderful, have a great day!
CUSTOMER: thank you
ACTION: [pull-up-account] Account has been pulled up for Hairy Pancakes.
ACTION: [verify-identity] Identity verification in progess ...
ACTION: [update-account] Account has been updated with Sanya Afzal.
```

## 10. abcd-5315

- Logged contact reason (may be wrong): `policy_2`
- Policy steps for it: none (FAQ intent)

```
AGENT: Hello, how may I help you?
CUSTOMER: Hello, I would like to know what the refund policy is as I am looking to purchase something for my husband
AGENT: Sure, I can tell you about that. Could I get your name, please?
ACTION: [search-faq] Searching the FAQ pages ...
CUSTOMER: Chloe Zhang
ACTION: [search-policy] System Action: search policy
ACTION: [select-faq] FAQ answer related to policy (question2) was selected.
AGENT: Hi, Chloe. We can only refund items that have not yet been shipped. But otherwise, we will refund you if you provide a valid Order ID, username, and email address.
AGENT: Is there anything else I can do for you?
CUSTOMER: That is all
AGENT: Have a great day!
```

## 11. abcd-1390

- Logged contact reason (may be wrong): `jacket_how_2`
- Policy steps for it: none (FAQ intent)

```
CUSTOMER: Hi, is this jacket dry clean only?
ACTION: [search-faq] Searching the FAQ pages ...
ACTION: [search-jacket] System Action: search jacket
AGENT: Hello, it is not dry clean only. We use high quality fabric in our materials, so you can wash and dry them in a typical washer and dryer!
CUSTOMER: Great! It is a little inconvenient when one is not machine washable.
AGENT: I highly agree! Especially with everything happening right now, you may not even be able to find one that is open!
AGENT: Anyway, is there anything else I can help you with?
ACTION: [select-faq] FAQ answer related to jacket (how2) was selected.
CUSTOMER: Do they come in different colors
AGENT: Hello, I would have to direct you to our website, as our stock is very dynamic. If you do not see the color you like, I suggest checking back at the end of the month, when we refill the stock
CUSTOMER: That's alright. I actually want it in red if you have it. But if not, I'll get this.
AGENT: That sounds great! Is there anything else I can help you with?
CUSTOMER: this is good. thank you
AGENT: Have a great day!
```

## 12. abcd-9380

- Logged contact reason (may be wrong): `shopping_cart`
- Policy steps for it: try-again → log-out-in → enter-details → make-purchase

```
AGENT: hello, how can I help?
CUSTOMER: the website is really slow and not usable at this speed
AGENT: oK. you know, I think everyone is shopping these days. Let me see what we can do to help.
CUSTOMER: ok
AGENT: at worst, I can let out team know. But first, have you checked that you can load other websites?
ACTION: [try-again] Agent is looking for solutions ...
CUSTOMER: one second while i try another website
CUSTOMER: still going slow
AGENT: i was afraid of that. Do you have lots of other tabs open? That really slows things down
AGENT: would you please close the other tabs you have open?
AGENT: sry, I know it is a pain
CUSTOMER: one second as i close the other tabs
ACTION: [instructions] Agent is looking for solutions ...
CUSTOMER: ok it is now working
AGENT: great!
AGENT: thaks for gettin gin touch. hope it all runs smoothly. is there anything else today?
CUSTOMER: that is all. thanks
AGENT: bye bye
```

## 13. abcd-7884

- Logged contact reason (may be wrong): `boots_how_3`
- Policy steps for it: none (FAQ intent)

```
CUSTOMER: Hi
CUSTOMER: I want to know more about a product because I am thinking of buying it
AGENT: Hello. How can i help you today?
AGENT: Okay which product is it?
CUSTOMER: it is a calvin klein boots
CUSTOMER: I want to know how to remove gum from its sole
AGENT: okay lets see what I can find out
ACTION: [search-faq] Searching the FAQ pages ...
ACTION: [search-boots] System Action: search boots
AGENT: Okay I found an answer for you
AGENT: You want to use a knife to put some peanut butter on the gum
AGENT: wait 15 minutes
AGENT: then scrape it off and clean the shoe normally
CUSTOMER: interesting, wow did not know that. Thank you
AGENT: Is there anything else I can help you with?
CUSTOMER: no, that is all for today, thank you
AGENT: have a great day
```

## 14. abcd-7890

- Logged contact reason (may be wrong): `boots_how_2`
- Policy steps for it: none (FAQ intent)

```
AGENT: Hi.  How can I help you?
CUSTOMER: There's a product I'm interested in and would like to know a detail about it
AGENT: Ok, what would you like to know?
CUSTOMER: There are boots by Guess for $59, what is the width of the boot, regular or wide?
ACTION: [search-faq] Searching the FAQ pages ...
ACTION: [search-boots] System Action: search boots
AGENT: Different boots are different sizes.  The boots in general are 1/6 wider than the usual U.S. system
CUSTOMER: So would that be considered wide?
AGENT: If you're not sure if a boot will fit you should try it on and return if there's a problem
CUSTOMER: Okay, thank you
AGENT: Of course
AGENT: Is there anything else I can do for you today?
AGENT: Ok, I'll end this chat now
CUSTOMER: Okay, thank you again
```

## 15. abcd-1448

- Logged contact reason (may be wrong): `bad_price_competitor`
- Policy steps for it: pull-up-account → record-reason → verify-identity → promo-code

```
AGENT: Hello, how may I assist you?
CUSTOMER: Hello
CUSTOMER: So, I'm looking at some boots but the price is way too high compared to Amazon.
CUSTOMER: Is there anything you can do to offer a better price?
AGENT: May I have your full name or your account ID?
CUSTOMER: Because the current price on here is highway robbery
CUSTOMER: yeah
CUSTOMER: My name is Albert Sanders
ACTION: [pull-up-account] Account has been pulled up for Albert Sanders.
AGENT: May I have your account ID and an order ID if you have it?
CUSTOMER: My account ID is OWMVPZDUPW
CUSTOMER: my order ID is 8460630705
ACTION: [verify-identity] Identity verification in progess ...
AGENT: Our prices are dynamic and sometimes the algorithims that control prices change the price often.
CUSTOMER: Yeah, so what does that mean?
CUSTOMER: Can you guys match Amazon or not?
AGENT: I can offer you a code for a discount at our store.
CUSTOMER: How much is the discount?
AGENT: I cannot control the pricing but I can offer 20% off of the order.
CUSTOMER: Hmm
CUSTOMER: Okay, let's do it.
ACTION: [promo-code] A promo code has been created.
AGENT: Your promo code is AcmeShop2020
CUSTOMER: Okay, got it.
AGENT: Is there anything else I can assist you with?
CUSTOMER: Do you guys sell food? I'm starving.
AGENT: No, sorry just clothes.
CUSTOMER: Damn
CUSTOMER: Okay then
CUSTOMER: Have a nice day
AGENT: Goodbye
```
