import User from "../models/user.models.js";
import {v2 as cloudinary} from "cloudinary";

// models
import Notification from "../models/notification.model.js";
import bcrypt from "bcryptjs";

export const getUserProfile = async (req, res) => {
    const {username} = req.params;

    try{
        const user = await User.findOne({username}).select("-password");
        if(!user){
            return res.status(404).json({error: "User not found"});
        }
        res.status(200).json(user);
    }catch (error) {
        console.log("Error in getUserProfile: ", error.message);
        res.status(500).json({ error: error.message });
    }
};

export const followUnfollowUser = async (req, res) => {
    try{
        const {id} = req.params;
        const userToModify = await User.findById(id);
        const currentUser = await User.findById(req.user._id);

        if(id === req.user._id.toString()){
            return res.status(400).json({error: "You cannot follow yourself"});
        }

        if(!userToModify || !currentUser) return res.status(400).json({error: "User not found"}); 

        const isFollowing = currentUser.following.includes(id);

        if(isFollowing){
            //unfollow the user
            await User.findByIdAndUpdate(id, { $pull: { followers: req.user._id } });
            await User.findByIdAndUpdate(req.user._id, { $pull: { following: id } });
            //TODO return the id of the user as a response


            res.status(200).json({message: "User unfollowed"});
        } else{
            //follow the user
            await User.findByIdAndUpdate(id, { $push: { followers: req.user._id } }); 
            await User.findByIdAndUpdate(req.user._id, { $push: { following: id } });
            // send a notification to the user 
            const newNotification = new Notification({
                type: "follow",
                from: req.user._id,
                to: userToModify._id,
            });

            await newNotification.save();

            //TODO return the id of the user as a response
            res.status(200).json({message: "User followed"});
        }
    }catch (error){
        console.log("Error in getUserProfile: ", error.message);
        res.status(500).json({ error: error.message });
    }
};

export const getSuggestedUsers = async (req, res) => {
    try{
        const userId = req.user._id;

        const usersFollowedByMe = await User.findById(userId).select("following");

        const users = await User.aggregate([
            {
                $match:{
                    _id: {$ne:userId}
                }
            },
            {$sample:{size:10}}
        ])

        const filteredUsers = users.filter((user => !usersFollowedByMe.following.includes(user._id)));
        const suggestedUsers = filteredUsers.slice(0, 4);

        suggestedUsers.forEach(user=>user.password=null);

        res.status(200).json(suggestedUsers);
    }catch(error){
        console.log("Error in getSuggestedUsers: ", error.message);
        res.status(500).json({ error: error.message });
    }
};

export const updateUser = async (req, res) => {
    const {fullName, email, username, currentPassword, newPassword, bio, link} = req.body;
    let {profileImg, coverImg} = req.body;

    const userId = req.user._id;

    try {
        let user = await User.findById(userId);
        if(!user) return res.status(404).json({ message: "User not found" }); 
    //checking having to have the current password and the new password
        if((!newPassword && currentPassword) || (!currentPassword && newPassword)){
            return res.status(400).json({ error: "Please provide both current password and new password"});
        }

        if(currentPassword && newPassword){
            // user.password is the actual password that user has in the database
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            //checking the conditions that must be met for changing the password
            if(!isMatch) return res.status(400).json({ error: "Current password is incorrect"});
            if(newPassword.length < 6){
                return res.status(400).json({ error: "Password must be at least 6 characters long" });
            }

            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(newPassword, salt);
        }
// to able to update an image or store an image, I'll be using "cloudinary"
        if(profileImg) {
            if(user.profileImg){
                await cloudinary.uploader.destroy(user.profileImg.split("/").pop().split(".")[0]);
        }
            const uploadedResponse = await cloudinary.uploader.upload(profileImg)
            profileImg =uploadedResponse.secure_url;
        }
        if(coverImg) {
            if(user.coverImg){
                await cloudinary.uploader.destroy(user.coverImg.split("/").pop().split(".")[0]);
        }
            const uploadedResponse = await cloudinary.uploader.upload(coverImg)
            coverImg =uploadedResponse.secure_url;
        }

        user.fullName = fullName || user.fullName;
        user.email = email || user.email;
        user.username = username || user.username;
        user.bio = bio || user.bio;
        user.link = link || user.link;
        user.profileImg = profileImg || user.profileImg;
        user.coverImg = coverImg || user.coverImg;

        user = await user.save();

        // response should be null in response
        user.password = null;

        return res.status(200).json(user);
        
    } catch (error) {
        console.log("Error in updateUser: ", error.message);
        res.status(500).json({ error: error.message });
    }
};